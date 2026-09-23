import { accessFor } from "@/lib/access/policies";
import type { Spec } from "vexa/protocol";
import { findUser } from "@/lib/data/entities/users";
import { runWithAccess } from "@/lib/server/request-context";
import { handlerFor } from "@/lib/server/agent/handler";
import { models } from "@/lib/server/models";
import { EVAL_CASES, SCRIPTED_CASES, type EvalCase } from "@/lib/eval/cases";
import { checkTurn, scoreOf, type CheckResult, type Turn } from "@/lib/eval/check-cards";
import { emptyMeter, measure, type Metered } from "@/lib/server/usage-meter";

const CHAT_URL = "http://localhost:3100/api/chat";
const REPORT = ".eval-cards.json";
const DEFAULT_RUNS = 1;
const DATA_PREFIX = "data: ";
const DONE = "data: [DONE]";

type Part = Record<string, unknown>;
type ToolTrace = { tool: string; input: unknown; output?: unknown };
type CaseReport = { id: string; run: number; model: string; passed: number; total: number; failures: CheckResult[]; text: string; tools: ToolTrace[]; spec: Spec | null; usage: Metered };

function argOf(name: string, fallback: string): string {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function partsOf(raw: string): Part[] {
  return raw
    .split("\n")
    .filter((line) => line.startsWith(DATA_PREFIX) && !line.startsWith(DONE))
    .map((line) => JSON.parse(line.slice(DATA_PREFIX.length)) as Part);
}

function applyPatch(spec: Record<string, unknown>, patch: { op?: string; path?: string; value?: unknown }) {
  if (patch.op !== "add" && patch.op !== "replace") return;
  const segments = String(patch.path ?? "").split("/").filter(Boolean);
  if (segments.length === 0) return;
  let cursor = spec;
  for (const segment of segments.slice(0, -1)) {
    if (typeof cursor[segment] !== "object" || cursor[segment] === null) cursor[segment] = {};
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]] = patch.value;
}

function specOf(parts: Part[]): Spec | null {
  const spec: Record<string, unknown> = {};
  let seen = false;
  for (const part of parts) {
    if (part.type !== "data-spec") continue;
    const data = part.data as { type?: string; patch?: { op?: string; path?: string; value?: unknown } };
    if (data?.type !== "patch" || !data.patch) continue;
    applyPatch(spec, data.patch);
    seen = true;
  }
  return seen ? (spec as unknown as Spec) : null;
}

function toolTraceOf(parts: Part[]): ToolTrace[] {
  const outputs = new Map(parts.filter((part) => part.type === "tool-output-available").map((part) => [part.toolCallId, part.output]));
  return parts
    .filter((part) => part.type === "tool-input-available")
    .map((part) => ({ tool: String(part.toolName), input: part.input, output: outputs.get(part.toolCallId) }));
}

async function ask(testCase: EvalCase, model: string): Promise<Turn & { tools: ToolTrace[] }> {
  const user = findUser(testCase.userId);
  if (!user) throw new Error(`no user ${testCase.userId}`);
  const access = accessFor(user);
  const body = {
    id: `eval-${testCase.id}`,
    model,
    messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: testCase.prompt }] }],
  };
  const request = new Request(CHAT_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const response = await runWithAccess(access, () => handlerFor(access).POST(request));
  if (response.status !== 200) throw new Error(`chat returned ${response.status}`);
  const parts = partsOf(await response.text());
  return {
    text: parts.filter((part) => part.type === "text-delta").map((part) => String(part.delta ?? "")).join(""),
    spec: specOf(parts),
    toolOutputs: parts.filter((part) => part.type === "tool-output-available").map((part) => part.output as Record<string, unknown>),
    toolInputs: parts.filter((part) => part.type === "tool-input-available").map((part) => ({ tool: String(part.toolName), input: part.input })),
    tools: toolTraceOf(parts),
  };
}

const USD_DIGITS = 4;

function add(total: Metered, usage: Metered): Metered {
  return {
    calls: total.calls + usage.calls,
    inputTokens: total.inputTokens + usage.inputTokens,
    cachedTokens: total.cachedTokens + usage.cachedTokens,
    outputTokens: total.outputTokens + usage.outputTokens,
    reasoningTokens: total.reasoningTokens + usage.reasoningTokens,
    billedUsd: total.billedUsd + usage.billedUsd,
    billedCalls: total.billedCalls + usage.billedCalls,
    estimatedUsd: total.estimatedUsd + usage.estimatedUsd,
  };
}

function costOf(usage: Metered): string {
  if (usage.calls === 0) return "free";
  if (usage.billedCalls === usage.calls) return `$${usage.billedUsd.toFixed(USD_DIGITS)} billed`;
  if (usage.billedCalls > 0) return `$${usage.billedUsd.toFixed(USD_DIGITS)} billed for ${usage.billedCalls}/${usage.calls} calls · ~$${usage.estimatedUsd.toFixed(USD_DIGITS)} est.`;
  return `~$${usage.estimatedUsd.toFixed(USD_DIGITS)} est.`;
}

function usageLine(usage: Metered): string {
  const cached = usage.cachedTokens > 0 ? ` (${usage.cachedTokens.toLocaleString()} cached)` : "";
  const reasoning = usage.reasoningTokens > 0 ? ` (${usage.reasoningTokens.toLocaleString()} reasoning)` : "";
  return `${usage.calls} calls · in ${usage.inputTokens.toLocaleString()}${cached} · out ${usage.outputTokens.toLocaleString()}${reasoning} · ${costOf(usage)}`;
}

function line(report: CaseReport): string {
  const mark = report.failures.length === 0 ? "ok  " : "FAIL";
  const detail = report.failures.map((failure) => `${failure.id}: ${failure.detail}`).join(" · ");
  return `${mark} ${report.id.padEnd(22)} ${report.passed}/${report.total} [${usageLine(report.usage)}] ${detail}`;
}

async function main() {
  const registry = models();
  const model = argOf("model", Object.keys(registry)[0]);
  if (!registry[model]) throw new Error(`model ${model} is not in the registry (${Object.keys(registry).join(", ")})`);
  const runs = Number(argOf("runs", String(DEFAULT_RUNS)));
  const only = argOf("case", "");
  const all = model === "mock" ? SCRIPTED_CASES : EVAL_CASES;
  const cases = only ? all.filter((testCase) => testCase.id === only) : all;
  const reports: CaseReport[] = [];

  for (let run = 1; run <= runs; run += 1) {
    for (const testCase of cases) {
      const { result: turn, usage } = await measure(() => ask(testCase, model));
      const results = checkTurn(turn, testCase);
      const score = scoreOf(results);
      const report: CaseReport = { id: testCase.id, run, model, ...score, failures: results.filter((result) => !result.ok), text: turn.text, tools: turn.tools, spec: turn.spec, usage };
      reports.push(report);
      console.log(line(report));
    }
  }

  const passed = reports.filter((report) => report.failures.length === 0).length;
  const usage = reports.reduce((total, report) => add(total, report.usage), emptyMeter());
  console.log(`\n${passed}/${reports.length} cases clean · model ${model} · ${runs} run(s)`);
  console.log(`usage: ${usageLine(usage)}`);
  await Bun.write(REPORT, JSON.stringify({ model, runs, at: new Date().toISOString(), usage, reports }, null, 2));
  console.log(`report written to ${REPORT}`);
  if (passed < reports.length) process.exitCode = 1;
}

await main();
