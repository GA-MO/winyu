import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const DEFAULT_CAP_USD = 0.25;
const FALLBACK_CASE_USD = 0.0156;
const METER_CAP_EXIT = 2;
const PROJECT_LEDGER = path.join(process.cwd(), ".data", "model-calls.json");
const LEDGER_FILE = "model-calls.json";
const USD_DIGITS = 4;
const ID_WIDTH = 24;
const GROUP_WIDTH = 16;

const USAGE = `usage: bun run eval [--case=<id>[,<id>…]] [--stale] [--live (--case=<ids>|--changed) [--yes] [--cap=<usd>]] [--accept]
  (default)  score the committed recordings with code-only scorers: no model call, $0
  --stale    list recordings whose prompt, tools, model or question changed since they were recorded
  --live     re-record the chosen cases against the real model; prints the estimate and spends only with --yes
  --changed  with --live: the stale and missing recordings
  --cap      with --live: stop before a case that could take the run past this many dollars (default $${DEFAULT_CAP_USD})
  --accept   write today's failures to evals/known-failures.json as the accepted baseline`;

type Args = { cases: string[]; stale: boolean; live: boolean; changed: boolean; yes: boolean; cap: number; accept: boolean; help: boolean };

function argsOf(argv: readonly string[]): Args {
  const value = (name: string) => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
  const cap = Number(value("cap") ?? DEFAULT_CAP_USD);
  return {
    cases: (value("case") ?? "").split(",").filter(Boolean),
    stale: argv.includes("--stale"),
    live: argv.includes("--live"),
    changed: argv.includes("--changed"),
    yes: argv.includes("--yes"),
    cap: Number.isFinite(cap) && cap > 0 ? cap : DEFAULT_CAP_USD,
    accept: argv.includes("--accept"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

const args = argsOf(process.argv.slice(2));
if (args.help) {
  console.log(USAGE);
  process.exit(0);
}

const dataDir = mkdtempSync(path.join(tmpdir(), "mascop-eval-"));
process.env.MASCOP_DATA_DIR = dataDir;
process.env.MASCOP_SCHEDULER = "off";
process.on("exit", () => rmSync(dataDir, { recursive: true, force: true }));

const { ensureDemoStory } = await import("../lib/server/demo-story");
const { ensureFeedHistory } = await import("../lib/server/demo-feed-history");
await ensureDemoStory();
await ensureFeedHistory();

const { EVAL_CASES, groupOf } = await import("../lib/eval/cases");
const { readRecordings, turnOf, drawingOf, writeRecording } = await import("../lib/eval/recording");
const { promptHash, toolsHash } = await import("../lib/eval/fingerprint");
const { scoreTurn } = await import("../lib/harness/adapters/mastra/scorers");
const { agentModel } = await import("../lib/server/models");
const { KNOWN_FAILURES_FILE, readKnownFailures, unexpectedFailures, writeKnownFailures } = await import("../lib/eval/baseline");

type EvalCase = (typeof EVAL_CASES)[number];
type Recording = ReturnType<typeof readRecordings> extends Map<string, infer R> ? R : never;
type Score = Awaited<ReturnType<typeof scoreTurn>>[number];
type Known = ReturnType<typeof readKnownFailures>;
type CaseResult = { testCase: EvalCase; scores: Score[]; missing: boolean; drift: boolean };

function usd(value: number): string {
  return `$${value.toFixed(USD_DIGITS)}`;
}

function picked(): EvalCase[] {
  if (args.cases.length === 0) return EVAL_CASES;
  const unknown = args.cases.filter((id) => !EVAL_CASES.some((testCase) => testCase.id === id));
  if (unknown.length > 0) throw new Error(`unknown case ${unknown.join(", ")}`);
  return EVAL_CASES.filter((testCase) => args.cases.includes(testCase.id));
}

function currentModel(): string {
  return process.env.AGENT_MODEL || agentModel()?.id || "google/gemini-3.8-flash";
}

function staleReasons(testCase: EvalCase, recording: Recording | undefined): string[] {
  if (!recording) return ["no recording"];
  const reasons: string[] = [];
  if (recording.prompt !== testCase.prompt || recording.userId !== testCase.userId) reasons.push("question changed");
  if (recording.promptHash !== promptHash(testCase.userId)) reasons.push("prompt changed");
  if (recording.toolsHash !== toolsHash(testCase.userId)) reasons.push("tools changed");
  if (recording.model !== currentModel()) reasons.push(`model ${recording.model} → ${currentModel()}`);
  return reasons;
}

function medianCaseUsd(recordings: Map<string, Recording>): number {
  const costs = [...recordings.values()].map((recording) => recording.usage.usd).filter((cost) => cost > 0).sort((left, right) => left - right);
  if (costs.length === 0) return FALLBACK_CASE_USD;
  const middle = Math.floor(costs.length / 2);
  return costs.length % 2 === 1 ? costs[middle] : (costs[middle - 1] + costs[middle]) / 2;
}

async function scoreCase(testCase: EvalCase, recording: Recording | undefined): Promise<CaseResult> {
  if (!recording) return { testCase, scores: [{ id: "recorded", ok: false, detail: "ไม่มีการบันทึก: bun run eval --live --case=" + testCase.id }], missing: true, drift: false };
  const turn = turnOf(recording);
  const drift = JSON.stringify(drawingOf(turn)) !== JSON.stringify(recording.drawn);
  return { testCase, scores: await scoreTurn(turn, testCase), missing: false, drift };
}

function failuresOf(result: CaseResult): string[] {
  return result.scores.filter((score) => !score.ok).map((score) => score.id);
}

function lineOf(result: CaseResult, known: Known): string {
  const failed = result.scores.filter((score) => !score.ok);
  const accepted = known[result.testCase.id] ?? [];
  const fresh = unexpectedFailures(result.testCase.id, failuresOf(result), known);
  const mark = failed.length === 0 ? "ok   " : fresh.length === 0 ? "known" : "FAIL ";
  const passed = result.scores.length - failed.length;
  const drift = result.drift ? " (drawn differently than recorded)" : "";
  const detail = failed.map((score) => `${accepted.includes(score.id) ? "~" : ""}${score.id}: ${score.detail}`).join(" · ");
  return `${mark} ${result.testCase.id.padEnd(ID_WIDTH)} ${groupOf(result.testCase).padEnd(GROUP_WIDTH)} ${String(passed).padStart(2)}/${String(result.scores.length).padEnd(2)}${drift} ${detail}`;
}

function groupTable(results: readonly CaseResult[]): string[] {
  const groups = [...new Set(results.map((result) => groupOf(result.testCase)))];
  return groups.map((group) => {
    const members = results.filter((result) => groupOf(result.testCase) === group);
    const clean = members.filter((result) => failuresOf(result).length === 0).length;
    const checks = members.flatMap((result) => result.scores);
    const passed = checks.filter((score) => score.ok).length;
    return `  ${group.padEnd(GROUP_WIDTH)} cases clean ${clean}/${members.length} (${Math.round((clean / members.length) * 100)}%) · checks ${passed}/${checks.length}`;
  });
}

async function scoreAll(cases: readonly EvalCase[]): Promise<number> {
  const started = performance.now();
  const recordings = readRecordings();
  const known = readKnownFailures();
  const results: CaseResult[] = [];
  for (const testCase of cases) {
    const result = await scoreCase(testCase, recordings.get(testCase.id));
    results.push(result);
    console.log(lineOf(result, known));
  }
  const fresh = results.filter((result) => unexpectedFailures(result.testCase.id, failuresOf(result), known).length > 0);
  const clean = results.filter((result) => failuresOf(result).length === 0).length;
  const fixed = results.filter((result) => (known[result.testCase.id] ?? []).some((id) => !failuresOf(result).includes(id)));
  console.log(`\nby group:\n${groupTable(results).join("\n")}`);
  console.log(`\n${clean}/${results.length} cases clean · ${fresh.length} with failures not in evals/known-failures.json · scored from recordings in ${Math.round(performance.now() - started)} ms · 0 model calls, $0`);
  if (fixed.length > 0) console.log(`known failures that now pass (run --accept to drop them): ${fixed.map((result) => result.testCase.id).join(", ")}`);
  if (args.accept) {
    const baseline = Object.fromEntries(results.flatMap((result) => (failuresOf(result).length > 0 ? [[result.testCase.id, failuresOf(result)]] : [])));
    writeKnownFailures(baseline);
    console.log(`accepted ${Object.keys(baseline).length} cases' failures into ${path.relative(process.cwd(), KNOWN_FAILURES_FILE)}`);
    return 0;
  }
  return fresh.length > 0 ? 1 : 0;
}

function listStale(cases: readonly EvalCase[]): number {
  const recordings = readRecordings();
  const stale = cases.flatMap((testCase) => {
    const reasons = staleReasons(testCase, recordings.get(testCase.id));
    return reasons.length > 0 ? [`${testCase.id.padEnd(ID_WIDTH)} ${reasons.join(", ")}`] : [];
  });
  console.log(stale.length > 0 ? stale.join("\n") : "every recording matches the current prompt, tools, model and question");
  console.log(`\n${stale.length}/${cases.length} stale · re-record with: bun run eval --live --changed`);
  return 0;
}

function meterAllows(): boolean {
  const meter = process.env.EVAL_SPEND_METER;
  if (!meter) return true;
  const run = Bun.spawnSync(["bun", meter], { stdout: "pipe", stderr: "pipe" });
  console.log(`  meter: ${run.stdout.toString().trim().split("\n").at(-1) ?? ""}`);
  return run.exitCode !== METER_CAP_EXIT;
}

function copyNewCalls(copied: number): number {
  const local = path.join(dataDir, LEDGER_FILE);
  const calls = existsSync(local) ? (JSON.parse(readFileSync(local, "utf8")) as unknown[]) : [];
  const fresh = calls.slice(copied);
  if (fresh.length === 0) return copied;
  const project = existsSync(PROJECT_LEDGER) ? (JSON.parse(readFileSync(PROJECT_LEDGER, "utf8")) as unknown[]) : [];
  writeFileSync(PROJECT_LEDGER, JSON.stringify([...project, ...fresh], null, 2));
  return calls.length;
}

async function recordLive(cases: readonly EvalCase[]): Promise<number> {
  if (!args.changed && args.cases.length === 0) {
    console.error("--live needs --case=<ids> or --changed: a live run never re-records every case by default");
    return 2;
  }
  const recordings = readRecordings();
  const chosen = args.changed ? cases.filter((testCase) => staleReasons(testCase, recordings.get(testCase.id)).length > 0) : cases;
  const perCase = medianCaseUsd(recordings);
  console.log(`live: ${chosen.length} case(s) × ${usd(perCase)} median recorded cost ≈ ${usd(chosen.length * perCase)} · cap ${usd(args.cap)} · model ${currentModel()}`);
  if (chosen.length === 0) return 0;
  console.log(`  ${chosen.map((testCase) => testCase.id).join(", ")}`);
  if (!args.yes) {
    console.log("nothing spent: add --yes to record");
    return 2;
  }
  const { recordCase } = await import("../lib/harness/adapters/mastra/record");
  let spent = 0;
  let copied = 0;
  let recorded = 0;
  for (const testCase of chosen) {
    if (spent + perCase > args.cap) {
      console.log(`stopped before ${testCase.id}: ${usd(spent)} spent + ${usd(perCase)} would pass the cap ${usd(args.cap)}`);
      break;
    }
    if (!meterAllows()) {
      console.log(`stopped before ${testCase.id}: the shared spend meter is at its cap`);
      break;
    }
    const recording = await recordCase({ caseId: testCase.id, userId: testCase.userId, prompt: testCase.prompt });
    copied = copyNewCalls(copied);
    spent += recording.usage.usd;
    recorded += 1;
    writeRecording(recording);
    const result = await scoreCase(testCase, recording);
    console.log(`${lineOf(result, readKnownFailures())} [${recording.usage.calls} calls · ${usd(recording.usage.usd)}${recording.error ? ` · ${recording.error}` : ""}]`);
  }
  console.log(`\nrecorded ${recorded}/${chosen.length} · spent ${usd(spent)} (in the project ledger .data/${LEDGER_FILE} as source eval)`);
  return 0;
}

async function main(): Promise<number> {
  const cases = picked();
  if (args.stale) return listStale(cases);
  if (args.live) return recordLive(cases);
  return scoreAll(cases);
}

process.exit(await main());
