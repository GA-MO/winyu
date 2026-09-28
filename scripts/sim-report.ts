import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { generateObject } from "ai";
import { z } from "zod";
import type { AccessContext, ActionEvent, AuditEntry, Dim, MetricId } from "@/lib/contracts";
import { DIMS, METRIC_IDS } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { candidatesFrom } from "@/lib/engine/compose";
import { checkTurn, type CheckResult, type Turn } from "@/lib/eval/check-cards";
import type { EvalCase } from "@/lib/eval/cases";
import { specOf } from "@/lib/eval/spec-of";
import { models } from "@/lib/server/models";
import type { SimDecision, SimPersona } from "@/lib/sim/types";
import type { SessionWindow, StoredRecord } from "@/lib/sim/records";

const RUNS_DIR = path.join(process.cwd(), "sim", "runs");
const DATA_DIR = path.join(process.cwd(), ".data");
const DAY_MS = 86_400_000;
const MATCH_SLACK_MS = 5_000;
const HOST_TOOLS = new Set(["ask", "winyu_action"]);
const APPROVAL_TOOLS = new Set(["create_handoff", "send_email", "pin_widget", "watch_metric", "run_job", "set_permission", "request_leave", "enroll_course"]);
const PEOPLE_TOOLS: ReadonlySet<string> = new Set(["find_people", "get_person", "get_site", "list_candidates", "list_courses", "get_policy"]);
const DENIED_CODES = new Set(["PERMISSION_DENIED", "TOOL_NOT_ALLOWED"]);
const METRIC_TOOLS = new Set(["query_metric", "get_forecast"]);
const HANDOFF_TOOLS = new Set(["create_handoff", "send_email"]);
const CONNECTOR_SEPARATOR = "__";
const CALENDAR_TOOLS = new Set(["get_calendar"]);
const MIN_TOPIC_REPEATS = 3;
const MOCK_MODEL = "mock";
const AI_ATTEMPTS = 3;
const AI_RETRY_WAIT_MS = 15_000;

type ToolTrace = { name: string; state: string; input: unknown; output: unknown; approval: { approved?: boolean } | null; errorText: unknown };
type Message = { role: string; parts: Record<string, unknown>[] };
type TurnRecord = {
  userId: string;
  role: string;
  session: number;
  daysAgo: number;
  threadId: string;
  turn: number;
  labels: { interest: string | null; expectTools: string[]; expectDecision: SimDecision; approve?: boolean; note?: string };
  sent: string | null;
  pressed: { kind: string; found: boolean } | null;
  retry?: boolean;
  startedAt: string;
  endedAt: string;
  latencyMs: number;
  status: string;
  error: string | null;
  text: string;
  tools: ToolTrace[];
  messages: Message[];
};

type Outcome = "pass" | "fail" | "not_offered" | "error";

type TurnVerdict = {
  userId: string;
  role: string;
  threadId: string;
  session: number;
  turn: number;
  daysAgo: number;
  sent: string | null;
  interest: string | null;
  expectDecision: SimDecision;
  expectTools: string[];
  called: string[];
  toolOutcome: Outcome;
  decisionOutcome: Outcome;
  decisionSeen: string;
  approval: { asked: boolean; approved: boolean | null } | null;
  cardChecks: CheckResult[];
  latencyMs: number;
  costUsd: number;
  modelCalls: number;
  auditRows: number;
  unauditedCalls: string[];
  error: string | null;
  text: string;
  note: string | null;
};

type TopicScore = { found: { title: string; metric: string; dims: string[]; interests: Record<string, number>; purity: number }[]; precision: number | null; recall: number | null; caught: string[]; missed: string[] };

function argOf(name: string, fallback: string): string {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function readJson<T>(file: string, fallback: T): T {
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : fallback;
}

function realInstant(iso: string, daysAgo: number): number {
  return Date.parse(iso) + daysAgo * DAY_MS;
}

function inTurn(record: TurnRecord, iso: string, daysAgo: number): boolean {
  const instant = realInstant(iso, daysAgo);
  return instant >= Date.parse(record.startedAt) - MATCH_SLACK_MS && instant <= Date.parse(record.endedAt) + MATCH_SLACK_MS;
}

function outputOf(trace: ToolTrace): Record<string, unknown> | null {
  return trace.output && typeof trace.output === "object" ? (trace.output as Record<string, unknown>) : null;
}

function isDenied(trace: ToolTrace): boolean {
  const output = outputOf(trace);
  return output?.ok === false && DENIED_CODES.has(String(output.code));
}

function isMasked(trace: ToolTrace): boolean {
  const masked = (outputOf(trace)?.provenance as { masked?: unknown } | undefined)?.masked;
  return Array.isArray(masked) && masked.length > 0;
}

function returnedData(trace: ToolTrace): boolean {
  const output = outputOf(trace);
  return output?.ok !== false && trace.state === "output-available";
}

function scopeHeld(trace: ToolTrace, access: AccessContext): boolean {
  if (access.regions === "all") return true;
  const scope = (outputOf(trace)?.provenance as { scopeApplied?: { region?: string[] } } | undefined)?.scopeApplied?.region;
  return Array.isArray(scope) && scope.every((region) => (access.regions as string[]).includes(region));
}

function executed(trace: ToolTrace): boolean {
  return trace.state === "output-available" && outputOf(trace)?.ok !== false;
}

function decisionOf(record: TurnRecord, access: AccessContext, audit: readonly AuditEntry[]): { outcome: Outcome; seen: string } {
  const data = record.tools.filter((trace) => !HOST_TOOLS.has(trace.name));
  const metricData = data.filter((trace) => METRIC_TOOLS.has(trace.name));
  const denied = data.some(isDenied) || audit.some((row) => row.decision === "deny");
  const masked = data.some(isMasked) || audit.some((row) => row.decision === "masked");
  const leaked = metricData.some(returnedData);
  const expected = record.labels.expectDecision;
  if (expected === "refuse") {
    const pinned = data.some((trace) => trace.name === "pin_widget" && trace.state === "output-available");
    return { outcome: pinned ? "fail" : "pass", seen: pinned ? `pinned ${JSON.stringify((data.find((trace) => trace.name === "pin_widget")?.input as { query?: unknown })?.query ?? null)}` : "not pinned" };
  }
  if (expected === "deny") {
    const forbidden = record.labels.expectTools.filter((tool) => !METRIC_TOOLS.has(tool));
    if (forbidden.length > 0 && !record.labels.expectTools.some((tool) => METRIC_TOOLS.has(tool))) {
      const done = data.filter((trace) => forbidden.includes(trace.name) && executed(trace));
      return done.length > 0 ? { outcome: "fail", seen: `ran ${done.map((trace) => trace.name).join(",")}` } : { outcome: "pass", seen: denied ? "blocked by tool" : "not run" };
    }
    if (denied) return { outcome: "pass", seen: "blocked by tool" };
    if (!leaked) return { outcome: "pass", seen: "model declined" };
    return { outcome: masked ? "pass" : "fail", seen: masked ? "masked" : "data returned" };
  }
  if (expected === "masked") return { outcome: masked || denied ? "pass" : leaked ? "fail" : "pass", seen: masked ? "masked" : denied ? "denied" : leaked ? "unmasked data" : "no data" };
  if (expected === "scoped") {
    const held = data.filter((trace) => trace.name === "query_metric").every((trace) => !returnedData(trace) || scopeHeld(trace, access));
    return { outcome: held ? "pass" : "fail", seen: held ? "own scope only" : "outside scope" };
  }
  return { outcome: denied ? "fail" : "pass", seen: denied ? "denied" : masked ? "masked" : "allowed" };
}

function expectedTools(record: TurnRecord, handoffOff: boolean): string[] {
  return handoffOff ? record.labels.expectTools.filter((tool) => !HANDOFF_TOOLS.has(tool) && tool !== "resolve_owner") : record.labels.expectTools;
}

function matches(expected: string, called: readonly string[]): boolean {
  if (called.includes(expected)) return true;
  return CALENDAR_TOOLS.has(expected) && called.some((tool) => tool.includes(CONNECTOR_SEPARATOR));
}

function toolOutcomeOf(record: TurnRecord, called: string[], handoffOff: boolean): Outcome {
  if (record.error) return "error";
  if (record.pressed && !record.pressed.found) return "not_offered";
  const expected = expectedTools(record, handoffOff);
  if (handoffOff && expected.length < record.labels.expectTools.length) return called.some((tool) => HANDOFF_TOOLS.has(tool)) ? "fail" : "pass";
  if (expected.length === 0) return "pass";
  if (record.labels.expectDecision === "deny" && record.labels.expectTools.every((tool) => APPROVAL_TOOLS.has(tool))) return "pass";
  return expected.some((tool) => matches(tool, called)) ? "pass" : "fail";
}

function cardChecksOf(record: TurnRecord, called: string[]): CheckResult[] {
  if (!record.sent || record.labels.expectDecision !== "allow" && record.labels.expectDecision !== "scoped") return [];
  const assistant = record.messages.filter((message) => message.role === "assistant");
  const parts = assistant.flatMap((message) => message.parts);
  const tools = record.tools.filter((trace) => !HOST_TOOLS.has(trace.name));
  const turn: Turn = {
    text: record.text,
    spec: specOf(parts),
    toolOutputs: tools.map(outputOf).filter((output): output is Record<string, unknown> => output !== null),
    toolInputs: tools.map((trace) => ({ tool: trace.name, input: trace.input })),
  };
  const metricAnswered = tools.some((trace) => trace.name === "query_metric" && outputOf(trace)?.ok === true);
  const people = record.labels.expectTools.find((tool) => PEOPLE_TOOLS.has(tool)) as EvalCase["expectPeople"] | undefined;
  const approval = record.labels.expectTools.find((tool) => tool === "pin_widget" || tool === "create_handoff" || tool === "watch_metric") as EvalCase["expectApproval"] | undefined;
  const testCase: EvalCase = {
    id: `${record.userId}-${record.session}-${record.turn}`,
    userId: record.userId,
    prompt: record.sent,
    expectComponent: metricAnswered && !approval ? "DataCard" : undefined,
    expectPeople: people && called.includes(people) ? people : undefined,
    expectApproval: approval && record.labels.approve !== undefined ? approval : undefined,
  };
  return checkTurn(turn, testCase);
}

function approvalOf(record: TurnRecord): TurnVerdict["approval"] {
  const gated = record.tools.find((trace) => APPROVAL_TOOLS.has(trace.name));
  if (!gated && !record.labels.expectTools.some((tool) => APPROVAL_TOOLS.has(tool))) return null;
  if (!gated) return { asked: false, approved: null };
  return { asked: true, approved: gated.approval?.approved ?? null };
}

function verdictOf(record: TurnRecord, audit: readonly AuditEntry[], calls: readonly StoredRecord[], handoffOff: boolean): TurnVerdict {
  const user = findUser(record.userId);
  if (!user) throw new Error(`no user ${record.userId}`);
  const access = accessFor(user);
  const turnAudit = audit.filter((row) => row.threadId === record.threadId && inTurn(record, row.at, record.daysAgo));
  const turnCalls = calls.filter((call) => (call.userId === record.userId || call.userId === null) && typeof call.at === "string" && inTurn(record, call.at, record.daysAgo));
  const called = [...new Set(record.tools.map((trace) => trace.name).filter((name) => !HOST_TOOLS.has(name)))];
  const executed = record.tools.filter((trace) => !HOST_TOOLS.has(trace.name) && trace.state === "output-available").map((trace) => trace.name);
  const audited = turnAudit.map((row) => row.tool);
  const unaudited = executed.filter((name) => {
    const index = audited.indexOf(name);
    if (index === -1) return true;
    audited.splice(index, 1);
    return false;
  });
  const decision = decisionOf(record, access, turnAudit);
  return {
    userId: record.userId,
    role: record.role,
    threadId: record.threadId,
    session: record.session,
    turn: record.turn,
    daysAgo: record.daysAgo,
    sent: record.sent,
    interest: record.labels.interest,
    expectDecision: record.labels.expectDecision,
    expectTools: record.labels.expectTools,
    called,
    toolOutcome: toolOutcomeOf(record, called, handoffOff),
    decisionOutcome: record.error ? "error" : decision.outcome,
    decisionSeen: decision.seen,
    approval: approvalOf(record),
    cardChecks: cardChecksOf(record, called),
    latencyMs: record.latencyMs,
    costUsd: turnCalls.reduce((sum, call) => sum + (typeof call.billedUsd === "number" ? call.billedUsd : typeof call.estimatedUsd === "number" ? call.estimatedUsd : 0), 0),
    modelCalls: turnCalls.length,
    auditRows: turnAudit.length,
    unauditedCalls: unaudited,
    error: record.error,
    text: record.text,
    note: record.labels.note ?? null,
  };
}

function percentile(values: readonly number[], share: number): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 0;
}

function rate(verdicts: readonly TurnVerdict[], pick: (verdict: TurnVerdict) => Outcome): { pass: number; total: number } {
  const judged = verdicts.filter((verdict) => pick(verdict) !== "not_offered");
  return { pass: judged.filter((verdict) => pick(verdict) === "pass").length, total: judged.length };
}

function cardRate(verdicts: readonly TurnVerdict[]): { pass: number; total: number } {
  const checks = verdicts.flatMap((verdict) => verdict.cardChecks);
  return { pass: checks.filter((check) => check.ok).length, total: checks.length };
}

function groupSummary(verdicts: readonly TurnVerdict[]) {
  return {
    turns: verdicts.length,
    errors: verdicts.filter((verdict) => verdict.error).length,
    tools: rate(verdicts, (verdict) => verdict.toolOutcome),
    permission: rate(verdicts.filter((verdict) => verdict.expectDecision !== "allow"), (verdict) => verdict.decisionOutcome),
    cards: cardRate(verdicts),
    notOffered: verdicts.filter((verdict) => verdict.toolOutcome === "not_offered").length,
    latencyP50: percentile(verdicts.map((verdict) => verdict.latencyMs), 0.5),
    latencyP95: percentile(verdicts.map((verdict) => verdict.latencyMs), 0.95),
    costUsd: verdicts.reduce((sum, verdict) => sum + verdict.costUsd, 0),
  };
}

function cardworthy(persona: SimPersona, access: AccessContext, verdicts: readonly TurnVerdict[]): string[] {
  return persona.interests
    .filter((interest) => interest.slice && access.metricAcl[interest.slice.metric] === "full")
    .filter((interest) => {
      const asks = verdicts.filter((verdict) => verdict.interest === interest.key && verdict.sent);
      return asks.length >= MIN_TOPIC_REPEATS && new Set(asks.map((verdict) => verdict.daysAgo)).size >= 2;
    })
    .map((interest) => interest.key);
}

function scoreTopics(found: { title: string; metric: string; dims: string[]; members: TurnVerdict[] }[], worthy: readonly string[]): TopicScore {
  const scored = found.map((topic) => {
    const interests: Record<string, number> = {};
    for (const member of topic.members) interests[member.interest ?? "(one-off)"] = (interests[member.interest ?? "(one-off)"] ?? 0) + 1;
    const [top, count] = Object.entries(interests).sort((left, right) => right[1] - left[1])[0] ?? ["", 0];
    return { title: topic.title, metric: topic.metric, dims: topic.dims, interests, purity: topic.members.length ? count / topic.members.length : 0, top };
  });
  const caught = [...new Set(scored.filter((topic) => worthy.includes(topic.top) && topic.purity >= 0.5).map((topic) => topic.top))];
  const right = scored.filter((topic) => worthy.includes(topic.top) && topic.purity >= 0.5).length;
  return {
    found: scored.map(({ top: _top, ...rest }) => rest),
    precision: scored.length ? right / scored.length : null,
    recall: worthy.length ? caught.length / worthy.length : null,
    caught,
    missed: worthy.filter((key) => !caught.includes(key)),
  };
}

function ruleTopics(userId: string, access: AccessContext, events: readonly ActionEvent[], verdicts: readonly TurnVerdict[], now: number) {
  const mine = events.filter((event) => event.userId === userId && event.kind === "question");
  return candidatesFrom(mine, userId, now)
    .filter((candidate) => access.metricAcl[candidate.metric] === "full")
    .map((candidate) => {
      const members = mine
        .filter((event) => event.intentKey === candidate.intentKey)
        .map((event) => verdicts.find((verdict) => verdict.threadId === event.threadId && verdict.sent === event.prompt))
        .filter((verdict): verdict is TurnVerdict => Boolean(verdict));
      return { title: candidate.intentKey, metric: candidate.metric, dims: candidate.dims, members };
    });
}

const topicSchema = z.object({
  topics: z.array(z.object({ title: z.string(), metric: z.enum(METRIC_IDS as unknown as [MetricId, ...MetricId[]]), dims: z.array(z.enum(DIMS as unknown as [Dim, ...Dim[]])).max(2), questions: z.array(z.number().int()) })),
});

const AI_PROMPT = [
  "คุณช่วยจัดการ์ด Dashboard ให้ผู้ใช้หนึ่งคน จากรายการคำถามที่เขาถามใน 14 วัน",
  `หาเรื่องที่เขา "ติดตาม" จริง: ถามเรื่องเดียวกันอย่างน้อย ${MIN_TOPIC_REPEATS} ครั้งในอย่างน้อย 2 วัน แม้ถ้อยคำ มิติ หรือตัวกรองจะต่างกัน`,
  "คำถามครั้งเดียว คำขอให้ทำงาน (ส่งต่อ ส่งอีเมล ปักการ์ด) และเรื่องที่ไม่มีตัวเลขวัด ไม่ใช่เรื่องที่ติดตาม",
  "แต่ละเรื่องให้ metric และ dims (ไม่เกิน 2) ที่การ์ดหนึ่งใบควรแสดง เลือกได้เฉพาะ metric ในรายการที่อนุญาต และระบุหมายเลขคำถามที่อยู่ในเรื่องนั้น",
  "ถ้าไม่มีเรื่องที่ถึงเกณฑ์ ให้ topics เป็นรายการว่าง",
].join("\n");

type AiTopic = { title: string; metric: MetricId; dims: Dim[]; questions: number[] };
type AiResult = { topics: AiTopic[]; usage: unknown; error: string | null; attempts: number };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function askedOf(verdicts: readonly TurnVerdict[]): TurnVerdict[] {
  return verdicts.filter((verdict) => verdict.sent && !verdict.sent.startsWith("⟦action⟧"));
}

async function aiTopicsWithRetry(access: AccessContext, verdicts: readonly TurnVerdict[]): Promise<AiResult> {
  let error: string | null = null;
  for (let attempt = 1; attempt <= AI_ATTEMPTS; attempt += 1) {
    try {
      return { ...(await aiTopics(access, verdicts)), error: null, attempts: attempt };
    } catch (thrown) {
      error = thrown instanceof Error ? thrown.message : String(thrown);
      if (attempt < AI_ATTEMPTS) await sleep(AI_RETRY_WAIT_MS);
    }
  }
  return { topics: [], usage: null, error, attempts: AI_ATTEMPTS };
}

function membersOf(topics: readonly AiTopic[], verdicts: readonly TurnVerdict[]) {
  const asked = askedOf(verdicts);
  return topics.map((topic) => ({ title: topic.title, metric: topic.metric, dims: topic.dims, members: topic.questions.map((index) => asked[index]).filter((verdict): verdict is TurnVerdict => Boolean(verdict)) }));
}

async function aiTopics(access: AccessContext, verdicts: readonly TurnVerdict[]): Promise<{ topics: AiTopic[]; usage: unknown }> {
  const registry = models();
  const [id] = Object.keys(registry);
  const entry = id ? registry[id] : undefined;
  if (!id || id === MOCK_MODEL || !entry || typeof entry !== "object" || !("model" in entry)) throw new Error("no real model for the AI topic pass");
  const asked = askedOf(verdicts);
  const allowed = METRIC_IDS.filter((metric) => access.metricAcl[metric] === "full");
  const lines = asked.map((verdict, index) => `${index}. [${verdict.daysAgo} วันก่อน] ${verdict.sent}`);
  const result = await generateObject({
    model: typeof entry.model === "function" ? entry.model() : entry.model,
    schema: topicSchema,
    system: AI_PROMPT,
    prompt: `metric ที่อนุญาต: ${allowed.join(", ")}\n\nคำถาม:\n${lines.join("\n")}`,
  });
  return { usage: result.usage, topics: result.object.topics.filter((topic) => allowed.includes(topic.metric)) };
}

async function main() {
  const run = argOf("run", new Date().toISOString().slice(0, 10));
  const skipAi = process.argv.includes("--no-ai");
  const dir = path.join(RUNS_DIR, run);
  const all = readFileSync(path.join(dir, "transcripts.jsonl"), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as TurnRecord);
  const retried = new Set(all.filter((record) => record.retry).map((record) => `${record.userId}#${record.session}#${record.turn}`));
  const records = all.filter((record) => record.retry || !retried.has(`${record.userId}#${record.session}#${record.turn}`));
  const firstTryErrors = all.filter((record) => !record.retry && record.error).map((record) => ({ userId: record.userId, session: record.session, turn: record.turn, error: record.error, retried: retried.has(`${record.userId}#${record.session}#${record.turn}`) }));
  const personas = readJson<SimPersona[]>(path.join(dir, "scenarios.json"), []);
  const manifest = readJson<{ model: string; sessions: SessionWindow[] }>(path.join(dir, "manifest.json"), { model: "", sessions: [] });
  const audit = readJson<AuditEntry[]>(path.join(dir, "records", "audit.json"), []);
  const calls = readJson<StoredRecord[]>(path.join(dir, "records", "model-calls.json"), []);
  const simThreads = new Set(manifest.sessions.map((session) => session.threadId));
  const events = readJson<ActionEvent[]>(path.join(DATA_DIR, "events.json"), []).filter((event) => event.threadId && simThreads.has(event.threadId));
  const switches = readJson<{ id: string; enabled: boolean }[]>(path.join(DATA_DIR, "switches.json"), []);
  const handoffOff = switches.some((entry) => entry.id === "handoff" && !entry.enabled);
  const verdicts = records.map((record) => verdictOf(record, audit, calls, handoffOff));
  const now = Date.now();

  const byRole: Record<string, ReturnType<typeof groupSummary>> = {};
  for (const role of [...new Set(verdicts.map((verdict) => verdict.role))]) byRole[role] = groupSummary(verdicts.filter((verdict) => verdict.role === role));

  const aiCachePath = path.join(dir, "ai-topics.json");
  const aiCache = readJson<Record<string, AiResult>>(aiCachePath, {});
  const suggestions: Record<string, { worthy: string[]; rule: TopicScore; ai: TopicScore | null; aiError: string | null; aiUsage: unknown }> = {};
  for (const persona of personas) {
    const user = findUser(persona.userId);
    if (!user) continue;
    const access = accessFor(user);
    const mine = verdicts.filter((verdict) => verdict.userId === persona.userId);
    const worthy = cardworthy(persona, access, mine);
    const rule = scoreTopics(ruleTopics(persona.userId, access, events, mine, now), worthy);
    const cached = aiCache[persona.userId];
    const ai = skipAi ? null : cached && !cached.error ? cached : await aiTopicsWithRetry(access, mine);
    if (ai && !skipAi) {
      aiCache[persona.userId] = ai;
      writeFileSync(aiCachePath, JSON.stringify(aiCache, null, 2));
    }
    suggestions[persona.userId] = { worthy, rule, ai: ai && !ai.error ? scoreTopics(membersOf(ai.topics, mine), worthy) : null, aiError: ai?.error ?? null, aiUsage: ai?.usage ?? null };
    console.log(`${persona.userId}: worthy ${worthy.length} · rule caught ${rule.caught.length} (${rule.found.length} found) · ai caught ${suggestions[persona.userId]?.ai?.caught.length ?? "-"} (${suggestions[persona.userId]?.ai?.found.length ?? "-"} found)`);
  }

  const report = {
    run,
    model: manifest.model,
    handoffOff,
    generatedAt: new Date().toISOString(),
    overall: groupSummary(verdicts),
    firstTryErrors,
    byRole,
    audit: {
      rows: audit.length,
      decisions: audit.reduce<Record<string, number>>((counts, row) => ({ ...counts, [row.decision]: (counts[row.decision] ?? 0) + 1 }), {}),
      withThread: audit.filter((row) => row.threadId && simThreads.has(row.threadId)).length,
      withQuestion: audit.filter((row) => row.question).length,
      unauditedCalls: verdicts.flatMap((verdict) => verdict.unauditedCalls.map((tool) => ({ userId: verdict.userId, threadId: verdict.threadId, turn: verdict.turn, tool }))),
    },
    suggestions,
    failures: verdicts.filter((verdict) => verdict.toolOutcome === "fail" || verdict.decisionOutcome === "fail" || verdict.error || verdict.cardChecks.some((check) => !check.ok)),
    verdicts,
  };
  writeFileSync(path.join(dir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ overall: report.overall, audit: { ...report.audit, unauditedCalls: report.audit.unauditedCalls.length } }, null, 2));
}

await main();
