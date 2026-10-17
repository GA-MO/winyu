import { randomUUID } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { sessionCookie } from "@/lib/server/auth/session-token";
import { DATA_DIR } from "@/lib/server/store/json-store";
import { rateOf } from "@/lib/server/usage-meter";
import { type AgUiEvent, type Reply, type Thread, followUp, interruptsOf, run, threadOf } from "./chat-client";

const SETTLE_MS = 4000;
const LEDGER_WAIT_MS = 15000;
const POLL_MS = 500;
const MS_PER_SECOND = 1000;
const CARD_ACTIVITY = "ACTIVITY_SNAPSHOT";
const CACHE_READ_SHARE = 0.1;
const TOKENS_PER_MILLION = 1_000_000;
const BASE_URL = process.env.PROBE_URL ?? "http://localhost:3100";
const OPENED_THREAD = /^\/c\/([^?]+)\?prompt=(.*)$/;

type Question = { key: string; userId: string; question: string; setup?: string; story?: string };
type Call = { turnId: string | null; modelId: string; source: string; inputTokens: number; cachedTokens: number; reasoningTokens: number; outputTokens: number; billedUsd: number | null; estimatedUsd: number };
type TraceEvent = { type: string; at: string };
type Trace = { id: string; events: TraceEvent[] };
type Card = { surfaceId: string; components: unknown[]; dataModel: unknown };
type Turn = {
  config: string;
  rep: number;
  key: string;
  userId: string;
  runId: string;
  status: number;
  wallSeconds: number;
  steps: number;
  stepSeconds: number[];
  reasoningTokens: number[];
  outputTokens: number;
  usd: number;
  priceShare: number[];
  tools: string[];
  interrupts: string[];
  text: string;
  cards: Card[];
  error: string | null;
};

const QUESTIONS: Question[] = [
  { key: "ceo-risk", userId: "u_thana", question: "นอกจากเรื่องอีสาน มีความเสี่ยงอื่นที่ผมควรรู้ก่อนขึ้นบอร์ดไหม เช่นสต๊อกค้าง ลูกหนี้" },
  {
    key: "rsm-delegate",
    userId: "u_anucha",
    setup: "ทีมผมเดือนนี้ถึงเป้าแค่ไหนแล้ว เอเย่นต์ไหนน่าห่วงสุด",
    question: "ขอนแก่นมหาชัยก็ตกเยอะเหมือนกัน ฝากงานให้คุณกฤตเข้าไปคุยกับเอเย่นต์เจ้านี้ภายในสัปดาห์นี้",
  },
  { key: "rsm-month-close", userId: "u_anucha", question: "ถ้าเป็นแบบนี้ต่อไป ภาคอีสานจะปิดเดือนได้ถึงเป้าไหม" },
  { key: "ceo-month-close", userId: "u_thana", question: "ทั้งบริษัทเดือนนี้จะปิดที่กี่เปอร์เซ็นต์ของเป้า" },
  { key: "rsm-why-agent", userId: "u_anucha", question: "ทำไมอีสานรุ่งโรจน์ ค้าส่งยอดตกหนักขนาดนี้" },
  { key: "rep-visit-week", userId: "u_krit", question: "สัปดาห์นี้ผมควรไปเยี่ยมเอเย่นต์รายไหนก่อน เพราะอะไร" },
  { key: "ceo-send-south", userId: "u_thana", question: "ส่งเรื่องหนี้นครศรีรุ่งเจริญให้ผู้จัดการขายภาคใต้ตามต่อหน่อย ขอแผนเก็บเงินภายในศุกร์นี้" },
  { key: "rsm-leave", userId: "u_anucha", question: "คุณนกปีนี้ใช้วันลาไปแล้วกี่วัน ลาป่วยกี่วัน" },
  { key: "ceo-share", userId: "u_thana", question: "ส่วนแบ่งตลาดเบียร์ของเราเทียบคู่แข่งเป็นยังไงบ้าง ภาคไหนเสียให้คู่แข่งมากสุด" },
  { key: "rep-target", userId: "u_krit", question: "เดือนนี้ผมขายได้กี่เปอร์เซ็นต์ของเป้าทั้งเดือนแล้ว ต้องขายอีกกี่ลิตรถึงจะครบเป้า" },
  { key: "rep-visit", userId: "u_krit", question: "วันนี้ควรไปเยี่ยมเอเย่นต์ไหนก่อน" },
  {
    key: "ceo-send",
    userId: "u_thana",
    setup: "ยอดขายเข้าจะปิดเดือนต่ำกว่าเป้า ช่องว่างส่วนใหญ่เกิดจากเอเย่นต์หลัก 2 รายที่น่าจะติดปัญหาเครดิต ช่วยสืบต่อให้หน่อย",
    question: "ส่งเรื่องนี้ให้ผู้จัดการขายภาคอีสาน ด่วน",
  },
  { key: "lookup-ceo-regions", userId: "u_thana", question: "ยอดขายเดือนนี้แยกตามภาค" },
  { key: "lookup-rep-stock", userId: "u_krit", question: "อีสานรุ่งโรจน์ของในสต็อกพอขายได้อีกกี่วัน" },
  { key: "it-audit", userId: "u_ton", question: "สัปดาห์นี้ใครถูกปฏิเสธสิทธิ์บ้าง และใครส่งงานอะไรให้ใคร" },
  { key: "ceo-askmore-overdue", userId: "u_thana", story: "u_thana-0", question: "" },
  { key: "ceo-askmore-send", userId: "u_thana", story: "u_thana-0", question: "ส่งเรื่องนี้ให้ผู้จัดการขายภาคอีสาน ด่วน" },
  { key: "ceo-year", userId: "u_thana", question: "ทั้งปีนี้ยอดขายจะถึงเป้าไหม" },
  { key: "it-rep-scope", userId: "u_ton", question: "ถ้าพนักงานขายถามยอดขายภาคใต้ เขาจะเห็นไหม" },
];

/** A thread opened from a morning story the way the ถามต่อ button opens it, so the turn runs with the story preloaded; its first question is the one the button asks. */
async function storyThread(userId: string, storyId: string): Promise<Thread> {
  const cookie = sessionCookie({ via: "demo", userId });
  const response = await fetch(`${BASE_URL}/c/new?story=${encodeURIComponent(storyId)}`, { headers: { cookie: `${cookie.name}=${cookie.value}` }, redirect: "manual" });
  const location = new URL(response.headers.get("location") ?? "", BASE_URL);
  const opened = OPENED_THREAD.exec(location.pathname + location.search);
  if (!opened?.[1] || opened[2] === undefined) throw new Error(`story ${storyId} did not open a thread (HTTP ${response.status})`);
  return { id: opened[1], userId, messages: [{ id: randomUUID(), role: "user", content: decodeURIComponent(opened[2]) }] };
}

function argOf(name: string): string | null {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
}

const CONFIG = argOf("config");
const REP = Number(argOf("rep") ?? "1");
const ONLY = argOf("only")?.split(",") ?? null;
const OUT = argOf("out");

function readJson<T>(file: string): T[] {
  try {
    return JSON.parse(readFileSync(path.join(DATA_DIR, file), "utf8")) as T[];
  } catch {
    return [];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function traceOf(runId: string): Promise<Trace | null> {
  const deadline = Date.now() + LEDGER_WAIT_MS;
  while (Date.now() < deadline) {
    const trace = readJson<Trace>("runs.json").find((entry) => entry.id === runId);
    if (trace?.events.some((event) => event.type === "agent.completed")) return trace;
    await sleep(POLL_MS);
  }
  return null;
}

function stepSecondsOf(trace: Trace | null): number[] {
  const events = trace?.events ?? [];
  const starts = events.filter((event) => event.type === "agent.thinking").map((event) => Date.parse(event.at));
  const ends = events.filter((event) => event.type === "agent.decided").map((event) => Date.parse(event.at));
  return starts.map((start, index) => (ends[index] === undefined ? Number.NaN : (ends[index] - start) / MS_PER_SECOND));
}

function finalCards(events: AgUiEvent[]): Card[] {
  const latest = new Map<string, Card>();
  for (const event of events as (AgUiEvent & { content?: unknown })[]) {
    if (event.type !== CARD_ACTIVITY || typeof event.content !== "object" || event.content === null) continue;
    const card = event.content as Card;
    latest.set(card.surfaceId, card);
  }
  return [...latest.values()];
}

/** What the call was billed against the standard list price for its tokens (cache reads at a tenth): 0.5 is the flex tier, 1 the standard one. */
function priceShareOf(call: Call): number {
  const rate = rateOf(call.modelId);
  const fresh = call.inputTokens - call.cachedTokens;
  const listUsd = (fresh * rate.input + call.cachedTokens * rate.input * CACHE_READ_SHARE + call.outputTokens * rate.output) / TOKENS_PER_MILLION;
  return (call.billedUsd ?? Number.NaN) / listUsd;
}

function errorOf(reply: Reply): string | null {
  if (reply.status !== 200) return `HTTP ${reply.status}`;
  return reply.events.find((event) => event.type === "RUN_ERROR")?.message ?? null;
}

async function timedTurn(question: Question, rep: number): Promise<Turn> {
  const opening = question.story ? await storyThread(question.userId, question.story) : threadOf(question.userId, question.setup ?? question.question);
  const asksAfter = question.setup !== undefined || (question.story !== undefined && question.question !== "");
  const thread = asksAfter ? followUp(opening, question.question) : opening;
  if (asksAfter) await run(opening);
  const startedAt = performance.now();
  const reply = await run(thread);
  const wallSeconds = (performance.now() - startedAt) / MS_PER_SECOND;
  const trace = await traceOf(reply.runId);
  await sleep(SETTLE_MS);
  const calls = readJson<Call>("model-calls.json").filter((call) => call.turnId === reply.runId);
  const chat = calls.filter((call) => call.source === "chat");
  return {
    config: CONFIG ?? "",
    rep,
    key: question.key,
    userId: question.userId,
    runId: reply.runId,
    status: reply.status,
    wallSeconds,
    steps: chat.length,
    stepSeconds: stepSecondsOf(trace),
    reasoningTokens: chat.map((call) => call.reasoningTokens),
    outputTokens: chat.reduce((sum, call) => sum + call.outputTokens, 0),
    usd: calls.reduce((sum, call) => sum + (call.billedUsd ?? call.estimatedUsd), 0),
    priceShare: chat.map(priceShareOf),
    tools: reply.events.filter((event) => event.type === "TOOL_CALL_START").map((event) => event.toolCallName ?? ""),
    interrupts: interruptsOf(reply).map((interrupt) => interrupt.metadata?.mastra?.toolName ?? interrupt.reason),
    text: reply.text,
    cards: finalCards(reply.events),
    error: errorOf(reply),
  };
}

function line(turn: Turn): string {
  const reasoning = turn.reasoningTokens.reduce((sum, tokens) => sum + tokens, 0);
  const steps = turn.stepSeconds.map((seconds) => seconds.toFixed(1)).join("+");
  return `${turn.config} r${turn.rep} ${turn.key.padEnd(18)} ${turn.wallSeconds.toFixed(1).padStart(5)} s · ${turn.steps} steps (${steps}) · reasoning ${reasoning} · $${turn.usd.toFixed(4)} (price ${turn.priceShare.map((share) => share.toFixed(2)).join(",")}) · tools [${turn.tools.join(",")}] · cards ${turn.cards.length}${turn.interrupts.length ? ` · asks ${turn.interrupts.join(",")}` : ""}${turn.error ? ` · ERROR ${turn.error}` : ""}`;
}

if (!CONFIG || !OUT) {
  console.log("usage: bun run scripts/bench-speed.ts --config=<label> --out=<file.jsonl> [--rep=1] [--only=key,…]; PROBE_URL and WINYU_DATA_DIR name the server under test and its data folder");
  process.exit(1);
}
for (const question of QUESTIONS) {
  if (ONLY && !ONLY.includes(question.key)) continue;
  const turn = await timedTurn(question, REP);
  appendFileSync(OUT, `${JSON.stringify(turn)}\n`);
  console.log(line(turn));
}
