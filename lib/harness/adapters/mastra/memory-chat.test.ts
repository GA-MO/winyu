import { afterEach, describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import type { LanguageModelV3Prompt } from "@ai-sdk/provider";
import { wrapLanguageModel } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { meterMiddleware } from "@/lib/server/usage-meter";
import { ScriptedModel } from "@/scripts/scripted-model";

setDefaultTimeout(30_000);

const UTILITY_ID = "utility-extractor";
const NO_FACTS = '{"facts":[]}';
const UTILITY_USAGE = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
const LEDGER_WAIT_MS = 3000;
const QUIET_WAIT_MS = 1000;
const LEDGER_POLL_MS = 25;

const scripted = new ScriptedModel();
let heard = NO_FACTS;
const extractor = new MockLanguageModelV3({
  provider: "mock",
  modelId: UTILITY_ID,
  doGenerate: async () => ({ content: [{ type: "text", text: heard }], finishReason: { unified: "stop", raw: "stop" }, usage: UTILITY_USAGE, warnings: [] }),
});
const utility = wrapLanguageModel({ model: extractor, middleware: [meterMiddleware(UTILITY_ID)] });
mock.module("@/lib/server/models", () => ({ ...scripted.modelsModule(), utilityModel: () => utility }));

const { serveCopilot, LEARNING } = await import("./serve");
const { findUser } = await import("@/lib/data/entities/users");
const { liveAccessFor } = await import("@/lib/access/enforce");
const { memoryFacts } = await import("@/lib/server/agent/collections");
const { forgetAll, learnExtracted } = await import("@/lib/engine/memory");
const { forgetConversations, indexTurn } = await import("./recall");
const { threadForRun } = await import("@/lib/server/threads-read");
const { GUIDANCE_HEADER } = await import("@/lib/server/agent/persona");
const { UNTRUSTED_OPEN } = await import("@/lib/harness/fence");
const { TH } = await import("@/lib/i18n/th");
const { modelCalls } = await import("@/lib/server/model-ledger");

const USER = "u_siriporn";
const RUN_URL = "http://localhost/api/copilotkit/agent/winyu/run";
const SOUTH_WORD = "ด้ามขวาน";
const SOUTH = `เรียกภาคใต้ว่า "${SOUTH_WORD}"`;
const OLD_TARGET = "900";

type SseEvent = { type?: string; toolCallId?: string; content?: string; outcome?: { type?: string; interrupts?: { id?: string }[] } };

function eventsOf(sse: string): SseEvent[] {
  return sse.split("\n").flatMap((line) => (line.startsWith("data:") ? [JSON.parse(line.slice("data:".length)) as SseEvent] : []));
}

function access() {
  const user = findUser(USER);
  if (!user) throw new Error(`no ${USER}`);
  return liveAccessFor(user);
}

async function run(threadId: string, message: { id: string; content: string }, resume: { id: string; approved: boolean } | null = null, runId: string = crypto.randomUUID()): Promise<SseEvent[]> {
  const answer = resume ? { resume: [{ interruptId: resume.id, status: "resolved", payload: { approved: resume.approved } }] } : {};
  const body = { threadId, runId, state: {}, messages: [{ ...message, role: "user" }], tools: [], context: [], forwardedProps: {}, ...answer };
  const request = new Request(RUN_URL, { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(body) });
  return eventsOf(await (await serveCopilot(access(), request, LEARNING)).text());
}

function ask(content: string) {
  return { id: crypto.randomUUID(), content };
}

function interruptOf(events: readonly SseEvent[]): string {
  const id = events.find((event) => event.type === "RUN_FINISHED" && event.outcome?.type === "interrupt")?.outcome?.interrupts?.[0]?.id;
  if (!id) throw new Error("the run raised no approval");
  return id;
}

function toolResults(events: readonly SseEvent[]): string[] {
  return events.flatMap((event) => (event.type === "TOOL_CALL_RESULT" && typeof event.content === "string" ? [event.content] : []));
}

function promptOfLastCall(): LanguageModelV3Prompt {
  const call = scripted.model.doStreamCalls.at(-1);
  if (!call) throw new Error("the model was never called");
  return call.prompt;
}

function systemOfLastCall(): string {
  return promptOfLastCall()
    .flatMap((message) => (message.role === "system" ? [message.content] : []))
    .join("\n");
}

function toolOutputsOfLastCall(): string {
  return JSON.stringify(promptOfLastCall().filter((message) => message.role === "tool"));
}

function facts() {
  return memoryFacts().where((fact) => fact.userId === USER);
}

afterEach(async () => {
  heard = NO_FACTS;
  forgetAll(USER);
  await forgetConversations(USER);
});

describe("remembering and forgetting from the chat", () => {
  test("forget removes the fact once approved: recall in the same turn no longer finds it, the turn does not learn it again, and the next prompt no longer carries it", async () => {
    learnExtracted(USER, [{ type: "vocabulary", value: SOUTH, asked: true }], null);
    const threadId = `forget-${Date.now()}`;
    const message = ask(`ลืมคำว่า${SOUTH_WORD}ไปเลย`);
    scripted.script([{ call: "forget", args: { about: SOUTH_WORD } }]);
    const asked = interruptOf(await run(threadId, message));
    expect(facts().map((fact) => fact.value)).toEqual([SOUTH]);
    scripted.script([{ call: "recall_memory", args: { query: SOUTH_WORD } }, { text: "ลืมแล้วครับ" }]);
    const answered = await run(threadId, message, { id: asked, approved: true });
    const recalled = toolResults(answered).map((content) => JSON.parse(content) as { data?: { value: string }[] }).find((result) => Array.isArray(result.data));
    expect(recalled?.data).toEqual([]);
    scripted.script([{ text: "ภาคใต้สัปดาห์นี้ทรงตัว" }]);
    await run(threadId, ask(`${SOUTH_WORD}สัปดาห์นี้เป็นไง`));
    expect(systemOfLastCall()).not.toContain(SOUTH_WORD);
    expect(facts().filter((fact) => fact.value.includes(SOUTH_WORD))).toEqual([]);
  });

  test("remember keeps the approved answer style as confirmed guidance the next prompt carries outside the data fence; a figure is refused without asking", async () => {
    const style = "ตอบสั้น ๆ เป็นข้อ ไม่เกินสามข้อ ไม่ต้องเกริ่น";
    const threadId = `remember-${Date.now()}`;
    const message = ask(`จำไว้นะ ต่อไป${style}`);
    scripted.script([{ call: "remember", args: { type: "style", value: style, until: null } }]);
    const asked = interruptOf(await run(threadId, message));
    scripted.script([{ text: "จำไว้แล้วครับ" }]);
    await run(threadId, message, { id: asked, approved: true });
    expect(facts().map((fact) => [fact.type, fact.value, fact.decayAt])).toEqual([["style", style, null]]);
    scripted.script([{ text: "ยอดขายตามเป้า" }]);
    await run(threadId, ask("ยอดขายเดือนนี้เป็นไง"));
    const system = systemOfLastCall();
    expect(system).toContain(GUIDANCE_HEADER);
    const guidance = system.slice(system.indexOf(GUIDANCE_HEADER)).split("\n\n").slice(0, 2).join("\n\n");
    expect(guidance).toContain(style);
    expect(guidance).not.toContain(UNTRUSTED_OPEN);

    scripted.script([{ call: "remember", args: { type: "interest", value: `เป้าทั้งปีของลีโอคือ ${OLD_TARGET} ล้านลิตร`, until: null } }, { text: "จำตัวเลขไม่ได้ครับ" }]);
    const refused = await run(`remember-figure-${Date.now()}`, ask(`จำไว้ว่าเป้าทั้งปีของลีโอคือ ${OLD_TARGET} ล้านลิตร`));
    expect(refused.some((event) => event.outcome?.type === "interrupt")).toBe(false);
    expect(toolResults(refused).join("\n")).toContain(TH.memory.figureRefused);
    expect(facts().some((fact) => fact.value.includes(OLD_TARGET))).toBe(false);
  });
});

describe("recalled conversations", () => {
  test("the model reads an old figure masked, now and in later turns of the thread, while the person's card gets their own words", async () => {
    const past = `recall-past-${Date.now()}`;
    const question = `จำไว้ว่าเป้าทั้งปีของลีโอคือ ${OLD_TARGET} ล้านลิตร`;
    threadForRun(past, USER, question);
    await indexTurn({ userId: USER, threadId: past, turnId: `${past}-1`, at: "2026-10-10T03:00:00.000Z", question, reply: "รับทราบครับ", queries: [] });
    const threadId = `recall-now-${Date.now()}`;
    scripted.script([{ call: "recall_memory", args: { query: "เป้าทั้งปีของลีโอ" } }, { text: "เคยคุยเรื่องเป้าลีโอไว้ครับ" }]);
    const events = await run(threadId, ask("เป้าลีโอที่ผมเคยบอกไว้คืออะไรนะ"));
    expect(toolResults(events).join("\n")).toContain(OLD_TARGET);
    expect(toolOutputsOfLastCall()).toContain(TH.memory.maskedNumber);
    expect(toolOutputsOfLastCall()).not.toContain(OLD_TARGET);
    scripted.script([{ text: "ยอดลีโอเดือนนี้ทรงตัว" }]);
    await run(threadId, ask("แล้วตอนนี้เป็นไงบ้าง"));
    expect(JSON.stringify(promptOfLastCall())).toContain(TH.memory.maskedNumber);
    expect(JSON.stringify(promptOfLastCall())).not.toContain(OLD_TARGET);
  });
});

async function ledgerRowOf(turnId: string, waitMs = LEDGER_WAIT_MS): Promise<boolean> {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (modelCalls().where((call) => call.modelId === UTILITY_ID && call.turnId === turnId).length > 0) return true;
    await new Promise((resolve) => setTimeout(resolve, LEDGER_POLL_MS));
  }
  return false;
}

describe("learning after a turn", () => {
  test("the extraction call is recorded in the ledger under the turn it learned from", async () => {
    const runId = crypto.randomUUID();
    scripted.script([{ text: "กำไรขั้นต้นทรงตัว" }]);
    await run(`ledger-${Date.now()}`, ask("กำไรขั้นต้นเดือนนี้เป็นไง"), null, runId);
    expect(await ledgerRowOf(runId)).toBe(true);
  });

  test("declining what Winyu offered to remember leaves nothing behind, even though the question said จำไว้", async () => {
    const style = "ตอบสั้น ๆ เป็นข้อ";
    heard = JSON.stringify({ facts: [{ type: "style", value: style, sameAs: null, asked: true, until: null }] });
    const threadId = `remember-declined-${Date.now()}`;
    const message = ask(`จำไว้ว่าผมชอบ${style}`);
    scripted.script([{ call: "remember", args: { type: "style", value: style, until: null } }]);
    const asked = interruptOf(await run(threadId, message));
    const answerRun = crypto.randomUUID();
    scripted.script([{ text: "ไม่จำครับ" }]);
    await run(threadId, message, { id: asked, approved: false }, answerRun);
    expect(await ledgerRowOf(answerRun, QUIET_WAIT_MS)).toBe(false);
    expect(facts()).toEqual([]);
  });
});
