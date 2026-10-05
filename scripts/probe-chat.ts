import { randomUUID } from "node:crypto";
import { auditLog } from "@/lib/server/audit";
import { layouts } from "@/lib/server/agent/collections";
import { runStore } from "@/lib/harness/runtime";
import { modelCalls } from "@/lib/server/model-ledger";
import { SESSION_COOKIE } from "@/lib/server/session-cookie";

const BASE_URL = process.env.PROBE_URL ?? "http://localhost:3200";
const RUN_PATH = "/api/copilotkit/agent/mascop/run";
const CEO = "u_thana";
const SALES_REP = "u_krit";
const SALES_BY_REGION = "ยอดขายเดือนนี้แยกตามภาค";
const PIN_SALES_BY_REGION = "ปักการ์ดยอดขายรายภาคไว้ที่แดชบอร์ด";
const APPROVAL_REASON = "mastra:tool_approval";
const MEMORY_SETTLE_MS = 4000;
const ONLY = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length).split(",") ?? null;

type AgUiEvent = { type: string; toolCallId?: string; toolCallName?: string; content?: string; delta?: string; message?: string; outcome?: { type: string; interrupts: Interrupt[] } };
type Interrupt = { id: string; reason: string; toolCallId: string; metadata?: { mastra?: { toolName?: string } } };
type Reply = { runId: string; status: number; events: AgUiEvent[]; text: string };
type Thread = { id: string; userId: string; messages: { id: string; role: "user"; content: string }[] };
type Check = { ok: boolean; label: string };

let failures = 0;

function check(ok: boolean, label: string): Check {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
  return { ok, label };
}

function eventsOf(sse: string): AgUiEvent[] {
  return sse.split("\n").flatMap((line) => {
    if (!line.startsWith("data:")) return [];
    try {
      return [JSON.parse(line.slice(5)) as AgUiEvent];
    } catch {
      return [];
    }
  });
}

function threadOf(userId: string, question: string): Thread {
  return { id: `probe-${randomUUID()}`, userId, messages: [{ id: randomUUID(), role: "user", content: question }] };
}

async function run(thread: Thread, resume: unknown[] | null = null): Promise<Reply> {
  const runId = randomUUID();
  const body = { threadId: thread.id, runId, state: {}, messages: thread.messages, tools: [], context: [], forwardedProps: {}, ...(resume ? { resume } : {}) };
  const response = await fetch(`${BASE_URL}${RUN_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream", cookie: `${SESSION_COOKIE}=${thread.userId}` },
    body: JSON.stringify(body),
  });
  const events = eventsOf(await response.text());
  const text = events.filter((event) => event.type === "TEXT_MESSAGE_CONTENT").map((event) => event.delta ?? "").join("");
  return { runId, status: response.status, events, text };
}

function resultOf(reply: Reply, tool: string): unknown {
  const call = reply.events.find((event) => event.type === "TOOL_CALL_START" && event.toolCallName === tool);
  const result = call ? reply.events.find((event) => event.type === "TOOL_CALL_RESULT" && event.toolCallId === call.toolCallId) : undefined;
  if (!result?.content) return null;
  try {
    return JSON.parse(result.content);
  } catch {
    return result.content;
  }
}

function interruptsOf(reply: Reply): Interrupt[] {
  const finished = reply.events.find((event) => event.type === "RUN_FINISHED");
  return finished?.outcome?.type === "interrupt" ? finished.outcome.interrupts : [];
}

function auditOf(runId: string, tool: string) {
  return auditLog().where((entry) => entry.turnId === runId && entry.tool === tool);
}

function traceHas(runId: string, type: string): boolean {
  return runStore().get(runId)?.events.some((event) => event.type === type) ?? false;
}

function widgetIds(userId: string): string[] {
  return (layouts().get(userId)?.widgets ?? []).map((widget) => widget.id);
}

function spendOf(runIds: readonly string[]): string {
  const calls = modelCalls().where((call) => call.turnId !== null && runIds.includes(call.turnId));
  const input = calls.reduce((sum, call) => sum + call.inputTokens, 0);
  const output = calls.reduce((sum, call) => sum + call.outputTokens, 0);
  const usd = calls.reduce((sum, call) => sum + (call.billedUsd ?? call.estimatedUsd), 0);
  return `${calls.length} model calls · ${input} in / ${output} out tokens · $${usd.toFixed(4)}`;
}

function summary(reply: Reply): string {
  const tools = reply.events.filter((event) => event.type === "TOOL_CALL_START").map((event) => event.toolCallName);
  return `run ${reply.runId} · HTTP ${reply.status} · tools [${tools.join(", ")}] · text "${reply.text.replace(/\s+/g, " ").slice(0, 120)}"`;
}

async function askedSalesByRegion(): Promise<string[]> {
  console.log(`\n(a) CEO ${CEO}: ${SALES_BY_REGION}`);
  const reply = await run(threadOf(CEO, SALES_BY_REGION));
  console.log(`  ${summary(reply)}`);
  const result = resultOf(reply, "query_metric") as { ok?: boolean; rows?: unknown[] } | null;
  check(result?.ok === true && (result.rows?.length ?? 0) > 0, `query_metric TOOL_CALL with a result (${result?.rows?.length ?? 0} rows)`);
  check(reply.text.length > 0, "assistant text");
  const audit = auditOf(reply.runId, "query_metric");
  check(audit.length > 0 && audit.every((entry) => entry.initiator === "person"), `audit row with initiator person and this run id (${audit.length})`);
  const trace = runStore().get(reply.runId);
  check(Boolean(trace?.events.some((event) => event.type === "agent.completed")), `saved run trace (${trace?.events.length ?? 0} events)`);
  return [reply.runId];
}

async function salesRepSeesOneRegion(): Promise<string[]> {
  console.log(`\n(b) sales_rep ${SALES_REP}: ${SALES_BY_REGION}`);
  const reply = await run(threadOf(SALES_REP, SALES_BY_REGION));
  console.log(`  ${summary(reply)}`);
  const result = resultOf(reply, "query_metric") as { ok?: boolean; rows?: Record<string, unknown>[]; provenance?: { scopeApplied?: { region?: string[] } } } | null;
  const regions = [...new Set((result?.rows ?? []).map((row) => row.region))];
  check(result?.ok === true && (result.rows?.length ?? 0) > 0, `query_metric result (${result?.rows?.length ?? 0} rows)`);
  check(JSON.stringify(result?.provenance?.scopeApplied?.region) === JSON.stringify(["northeast"]) && regions.length <= 1, `rows scoped to northeast only (scope ${JSON.stringify(result?.provenance?.scopeApplied?.region)}, regions ${JSON.stringify(regions)})`);
  check(auditOf(reply.runId, "query_metric").length > 0, "audit row for this run");
  return [reply.runId];
}

async function askToPin(label: string): Promise<{ thread: Thread; asking: Reply; interrupt: Interrupt | null; before: string[] }> {
  const thread = threadOf(CEO, PIN_SALES_BY_REGION);
  const before = widgetIds(CEO);
  const asking = await run(thread);
  console.log(`  ${label} ${summary(asking)}`);
  const interrupt = interruptsOf(asking).find((entry) => entry.reason === APPROVAL_REASON && entry.metadata?.mastra?.toolName === "pin_widget") ?? null;
  check(interrupt !== null, `run ends with a pin_widget approval interrupt (${interruptsOf(asking).map((entry) => entry.id).join(", ") || "none"})`);
  check(JSON.stringify(widgetIds(CEO)) === JSON.stringify(before), "no widget written before the answer");
  check(auditOf(asking.runId, "pin_widget").length === 0, "no pin_widget audit row before the answer");
  check(traceHas(asking.runId, "approval.requested"), "the asking run's trace records approval.requested");
  return { thread, asking, interrupt, before };
}

async function pinApproved(): Promise<string[]> {
  console.log(`\n(c) CEO ${CEO}: ${PIN_SALES_BY_REGION} → approve`);
  const { thread, asking, interrupt, before } = await askToPin("ask   ");
  if (!interrupt) return [asking.runId];
  const answer = await run(thread, [{ interruptId: interrupt.id, status: "resolved", payload: { approved: true } }]);
  console.log(`  answer ${summary(answer)}`);
  const result = resultOf(answer, "pin_widget") as { ok?: boolean; data?: { widgetId?: string } } | null;
  const widgetId = result?.data?.widgetId ?? null;
  check(result?.ok === true && widgetId !== null, `pin_widget executed (widget ${widgetId})`);
  check(widgetId !== null && widgetIds(CEO).includes(widgetId) && !before.includes(widgetId), "the widget exists in the CEO's layout");
  check(auditOf(answer.runId, "pin_widget").some((entry) => entry.initiator === "person"), "pin_widget audit row on the answering run");
  check(traceHas(answer.runId, "approval.granted"), "the answering run's trace starts with approval.granted");
  const pinned = widgetIds(CEO);
  const replayed = await run(thread, [{ interruptId: interrupt.id, status: "resolved", payload: { approved: true } }]);
  check(replayed.status === 409 && JSON.stringify(widgetIds(CEO)) === JSON.stringify(pinned), `replaying the spent answer is refused (HTTP ${replayed.status}), nothing pinned twice`);
  const goals = [asking.runId, answer.runId].map((runId) => runStore().get(runId)?.events.find((event) => event.type === "agent.started"));
  const goalIds = goals.map((event) => (event?.type === "agent.started" ? event.payload.goal.id : null));
  check(goalIds[0] !== null && goalIds[0] === goalIds[1], `the two runs share one goal (${goalIds[0]})`);
  return [asking.runId, answer.runId];
}

async function pinDeclined(): Promise<string[]> {
  console.log(`\n(d) CEO ${CEO}: ${PIN_SALES_BY_REGION} → decline`);
  const { thread, asking, interrupt, before } = await askToPin("ask   ");
  if (!interrupt) return [asking.runId];
  const answer = await run(thread, [{ interruptId: interrupt.id, status: "resolved", payload: { approved: false } }]);
  console.log(`  answer ${summary(answer)}`);
  check(JSON.stringify(widgetIds(CEO)) === JSON.stringify(before), "no widget written after the decline");
  check(auditOf(answer.runId, "pin_widget").length === 0, "no pin_widget audit row after the decline");
  check(traceHas(answer.runId, "approval.denied"), "the answering run's trace starts with approval.denied");
  return [asking.runId, answer.runId];
}

const SCENARIOS: Record<string, () => Promise<string[]>> = { a: askedSalesByRegion, b: salesRepSeesOneRegion, c: pinApproved, d: pinDeclined };

const startedAt = new Date().toISOString();
for (const [key, scenario] of Object.entries(SCENARIOS)) {
  if (ONLY && !ONLY.includes(key)) continue;
  const before = failures;
  const runIds = await scenario();
  console.log(`  ${failures === before ? "PASS" : "FAIL"} (${key}) · ${spendOf(runIds)}`);
}
await new Promise((resolve) => setTimeout(resolve, MEMORY_SETTLE_MS));
const all = modelCalls().where((call) => call.at >= startedAt);
console.log(`\nmodel calls during the probe: ${all.length} (chat ${all.filter((call) => call.source === "chat").length}, background ${all.filter((call) => call.source === "background").length}) · $${all.reduce((sum, call) => sum + (call.billedUsd ?? call.estimatedUsd), 0).toFixed(4)}`);
console.log(failures === 0 ? "probe:chat PASS" : `probe:chat FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
