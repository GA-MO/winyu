import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const OPENROUTER_HOST = "openrouter.ai";
const OUT_DIR = path.join(process.cwd(), ".shots", "f14-cache");
const PROJECT_LEDGER = path.join(process.cwd(), ".data", "model-calls.json");
const LEDGER_FILE = "model-calls.json";
const FAKE_REPLY = "ok";
const DEFAULT_CAP_USD = 0.07;
const METER_CAP_EXIT = 2;
const PROMPT_SEPARATOR = "\n\n";
const RULES_START = "ตอบเป็นภาษาไทย กระชับ";
const ROLE_LINE_START = "หน้าที่ของผู้ใช้:";
const USAGE = `usage: bun scripts/cache-probe.ts --dump | --live [--yes] [--cap=<usd>] [--users=a,b,c] [--prompts=…|…]
  --dump  asks each user each prompt with the model call intercepted ($0), saves every request body to .shots/f14-cache/
          and prints where two bodies stop sharing a prefix
  --live  asks the real model each prompt for each user twice, interleaved: "before" (the request rewritten to the
          old layout: personal lines first, no cache marker) and "after" (as sent today); prints cached share, $ and
          latency per side; spends only with --yes and stops before the cap or when EVAL_SPEND_METER exits 2`;

const DEFAULT_USERS = ["u_krit", "u_ploy", "u_somchai"];
const DEFAULT_PROMPTS = ["ยอดขายเดือนนี้เป็นอย่างไร", "เอเย่นต์รายไหนยอดตกมากสุด"];

type Side = "before" | "after";
type Body = Record<string, unknown> & { messages?: { role: string; content: unknown }[] };
type TextPart = { type: string; text: string; cache_control?: unknown };

function argValue(name: string): string | null {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
}

const mode = process.argv.includes("--live") ? "live" : process.argv.includes("--dump") ? "dump" : null;
if (!mode) {
  console.log(USAGE);
  process.exit(2);
}

const dataDir = mkdtempSync(path.join(tmpdir(), "mascop-cache-probe-"));
process.env.MASCOP_DATA_DIR = dataDir;
process.env.MASCOP_SCHEDULER = "off";
if (mode === "dump") process.env.OPENROUTER_API_KEY = "probe-no-spend";
process.on("exit", () => rmSync(dataDir, { recursive: true, force: true }));

type Captured = { label: string; body: Body };
const captured: Captured[] = [];
let currentLabel = "";
let currentSide: Side = "after";

function fakeCompletion(): Response {
  const base = { id: `gen-${randomUUID()}`, object: "chat.completion.chunk", created: 0, model: "google/gemini-3.8-flash" };
  const chunks = [
    { ...base, choices: [{ index: 0, delta: { role: "assistant", content: FAKE_REPLY }, finish_reason: null }] },
    { ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
  ];
  const text = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(text, { headers: { "content-type": "text/event-stream" } });
}

/** The system prompt as it was laid out before F14: intro, the person, their role, scope and day, then the shared context, memory and rules last, with no cache marker. */
export function previousLayout(system: string): string {
  const rulesAt = system.indexOf(RULES_START);
  const personalAt = system.indexOf(ROLE_LINE_START);
  if (rulesAt < 0 || personalAt < rulesAt) return system;
  const [intro, ...sharedContext] = system.slice(0, rulesAt).trimEnd().split(PROMPT_SEPARATOR);
  const rules = system.slice(rulesAt, personalAt).trimEnd();
  const [role, identity, scope, today, ...turn] = system.slice(personalAt).split(PROMPT_SEPARATOR);
  return [intro, identity, role, scope, today, ...sharedContext, ...turn, rules].join(PROMPT_SEPARATOR);
}

function asBefore(body: Body): Body {
  const messages = (body.messages ?? []).map((message) => {
    if (message.role !== "system" || !Array.isArray(message.content)) return message;
    const parts = (message.content as TextPart[]).map(({ cache_control: _marker, ...part }) => ({ ...part, text: previousLayout(part.text) }));
    return { ...message, content: parts };
  });
  return { ...body, messages };
}

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes(OPENROUTER_HOST)) return realFetch(input, init);
  const sent = JSON.parse(String(init?.body ?? "{}")) as Body;
  const body = currentSide === "before" ? asBefore(sent) : sent;
  captured.push({ label: currentLabel, body });
  if (mode === "dump") return fakeCompletion();
  return realFetch(input, { ...init, body: JSON.stringify(body) });
}) as typeof fetch;

const { ensureDemoStory } = await import("../lib/server/demo-story");
await ensureDemoStory();
const { liveAccessFor } = await import("../lib/access/enforce");
const { findUser } = await import("../lib/data/entities/users");
const { serveCopilot } = await import("../lib/harness/adapters/mastra/serve");
const { measure } = await import("../lib/server/usage-meter");

async function ask(userId: string, prompt: string): Promise<void> {
  const user = findUser(userId);
  if (!user) throw new Error(`no user ${userId}`);
  const body = { threadId: `probe-${randomUUID()}`, runId: randomUUID(), state: {}, messages: [{ id: randomUUID(), role: "user", content: prompt }], tools: [], context: [], forwardedProps: {} };
  const request = new Request("http://localhost/api/copilotkit/agent/mascop/run", { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(body) });
  const response = await serveCopilot(liveAccessFor(user), request, { learn: false });
  await response.text();
}

function commonPrefix(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) index += 1;
  return index;
}

type Part = { name: string; text: string };

function partsOf(body: Body): Part[] {
  const messages = body.messages ?? [];
  const system = messages.filter((message) => message.role === "system").map((message) => JSON.stringify(message.content)).join("");
  const rest = messages.filter((message) => message.role !== "system").map((message) => JSON.stringify(message)).join("");
  return [
    { name: "system", text: system },
    { name: "tools", text: JSON.stringify(body.tools ?? []) },
    { name: "messages", text: rest },
  ];
}

function divergence(left: Body, right: Body): string {
  const a = partsOf(left);
  const b = partsOf(right);
  let shared = 0;
  for (let index = 0; index < a.length; index += 1) {
    const prefix = commonPrefix(a[index].text, b[index].text);
    if (prefix < a[index].text.length || prefix < b[index].text.length) {
      const context = a[index].text.slice(Math.max(0, prefix - 40), prefix + 60).replace(/\n/g, "⏎");
      return `${shared + prefix} chars shared · splits in ${a[index].name} at char ${prefix}/${a[index].text.length}: …${context}…`;
    }
    shared += prefix;
  }
  return `${shared} chars shared · identical`;
}

function dump(): void {
  captured.forEach((call, index) => writeFileSync(path.join(OUT_DIR, `${index}-${call.label.split(" ")[0]}.json`), JSON.stringify(call.body, null, 2)));
  const sizes = (body: Body) => partsOf(body).map((part) => `${part.name} ${part.text.length}`).join(" · ");
  console.log(`captured ${captured.length} request bodies in ${OUT_DIR}`);
  for (let index = 0; index < captured.length; index += 1) {
    console.log(`\n#${index} ${captured[index].label} (${sizes(captured[index].body)})`);
    for (let earlier = 0; earlier < index; earlier += 1) console.log(`  vs #${earlier} ${captured[earlier].label}: ${divergence(captured[earlier].body, captured[index].body)}`);
  }
}

type Turn = { side: Side; userId: string; prompt: string; calls: number; input: number; cached: number; usd: number; ms: number };

function meterAllows(): boolean {
  const meter = process.env.EVAL_SPEND_METER;
  if (!meter) return true;
  return Bun.spawnSync(["bun", meter], { stdout: "pipe", stderr: "pipe" }).exitCode !== METER_CAP_EXIT;
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

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summary(turns: readonly Turn[], side: Side): string {
  const mine = turns.filter((turn) => turn.side === side);
  const input = mine.reduce((sum, turn) => sum + turn.input, 0);
  const cached = mine.reduce((sum, turn) => sum + turn.cached, 0);
  const usd = mine.reduce((sum, turn) => sum + turn.usd, 0);
  const calls = mine.reduce((sum, turn) => sum + turn.calls, 0);
  const ms = mine.map((turn) => turn.ms);
  return `${side.padEnd(6)} ${mine.length} questions · ${calls} calls · cached ${cached}/${input} (${((100 * cached) / Math.max(input, 1)).toFixed(1)}%) · $${(usd / Math.max(mine.length, 1)).toFixed(5)}/question ($${usd.toFixed(4)} total) · latency median ${median(ms)} ms (range ${Math.min(...ms)}–${Math.max(...ms)})`;
}

async function live(users: readonly string[], prompts: readonly string[]): Promise<void> {
  const cap = Number(argValue("cap") ?? DEFAULT_CAP_USD);
  const plan = prompts.flatMap((prompt, round) => users.map((userId, index) => ({ userId, prompt, order: (round * users.length + index) % 2 === 0 ? (["before", "after"] as const) : (["after", "before"] as const) })));
  console.log(`live: ${plan.length} questions × 2 sides, interleaved · cap $${cap}`);
  if (!process.argv.includes("--yes")) {
    console.log("nothing spent: add --yes to ask the model");
    return;
  }
  const turns: Turn[] = [];
  let spent = 0;
  let copied = 0;
  for (const step of plan) {
    for (const side of step.order) {
      if (spent >= cap || !meterAllows()) {
        console.log(`stopped: $${spent.toFixed(4)} spent, cap $${cap} or the shared meter reached`);
        console.log(summary(turns, "before"));
        console.log(summary(turns, "after"));
        return;
      }
      currentSide = side;
      currentLabel = `${step.userId} · ${step.prompt}`;
      const started = performance.now();
      const { usage } = await measure(() => ask(step.userId, step.prompt));
      const ms = Math.round(performance.now() - started);
      copied = copyNewCalls(copied);
      const usd = usage.billedUsd;
      spent += usd;
      turns.push({ side, userId: step.userId, prompt: step.prompt, calls: usage.calls, input: usage.inputTokens, cached: usage.cachedTokens, usd, ms });
      console.log(`${side.padEnd(6)} ${step.userId.padEnd(10)} ${step.prompt} · ${usage.calls} calls · cached ${usage.cachedTokens}/${usage.inputTokens} · $${usd.toFixed(5)} · ${ms} ms`);
    }
  }
  writeFileSync(path.join(OUT_DIR, "live-turns.json"), JSON.stringify(turns, null, 2));
  console.log(`\n${summary(turns, "before")}\n${summary(turns, "after")}\nturns saved to ${path.join(OUT_DIR, "live-turns.json")}`);
}

const users = (argValue("users") ?? DEFAULT_USERS.join(",")).split(",");
const prompts = (argValue("prompts") ?? DEFAULT_PROMPTS.join("|")).split("|");
mkdirSync(OUT_DIR, { recursive: true });
if (mode === "dump") {
  currentSide = process.argv.includes("--before") ? "before" : "after";
  for (const prompt of prompts) {
    for (const userId of users) {
      currentLabel = `${userId} · ${prompt}`;
      await ask(userId, prompt);
    }
  }
  dump();
} else {
  await live(users, prompts);
}
process.exit(0);
