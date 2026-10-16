import { describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import type { Message } from "@ag-ui/core";
import { ScriptedModel } from "@/scripts/scripted-model";

setDefaultTimeout(30_000);

const scripted = new ScriptedModel();
mock.module("@/lib/server/models", () => scripted.modelsModule());

const { serveCopilot, LEARNING } = await import("./serve");
const { threadHistory, screenCardsOn } = await import("./history");
const { cardNamed } = await import("@/components/chat/card-to-share");
const { findUser } = await import("@/lib/data/entities/users");
const { liveAccessFor } = await import("@/lib/access/enforce");

const USER = "u_thana";
const RUN_URL = "http://localhost/api/copilotkit/agent/winyu/run";
const BY_BRAND = { metric: "net_sales_volume", dims: ["brand"], grain: "month", range: { from: "2026-09-01", to: "2026-09-22" }, compare: "target", filters: {}, sort: "value_desc", limit: 10 };
const STORE_POLLS = 40;
const STORE_POLL_MS = 50;
const SEND_ARGS = { to: ["u_anucha"], ask: "ดูยอดขายเข้าแยกตามแบรนด์" };

type SseEvent = { type?: string; message?: string; toolCallId?: string; toolCallName?: string; outcome?: { type?: string; interrupts?: { id?: string }[] } };

function eventsOf(sse: string): SseEvent[] {
  return sse.split("\n").flatMap((line) => (line.startsWith("data:") ? [JSON.parse(line.slice("data:".length)) as SseEvent] : []));
}

function access() {
  const user = findUser(USER);
  if (!user) throw new Error(`no ${USER}`);
  return liveAccessFor(user);
}

type Asked = { id: string; content: string };

function ask(content: string): Asked {
  return { id: crypto.randomUUID(), content };
}

async function run(threadId: string, message: Asked, approve: string | null = null): Promise<SseEvent[]> {
  const answer = approve ? { resume: [{ interruptId: approve, status: "resolved", payload: { approved: true } }] } : {};
  const body = { threadId, runId: crypto.randomUUID(), state: {}, messages: [{ ...message, role: "user" }], tools: [], context: [], forwardedProps: {}, ...answer };
  const request = new Request(RUN_URL, { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(body) });
  return eventsOf(await (await serveCopilot(access(), request, LEARNING)).text());
}

function callIdOf(events: readonly SseEvent[], tool: string): string {
  const id = events.find((event) => event.type === "TOOL_CALL_START" && event.toolCallName === tool)?.toolCallId;
  if (!id) throw new Error(`the run never called ${tool}`);
  return id;
}

function resultOf(history: readonly Message[], toolCallId: string): unknown {
  const found = history.find((message) => message.role === "tool" && message.toolCallId === toolCallId);
  return found?.role === "tool" && typeof found.content === "string" ? JSON.parse(found.content) : undefined;
}

async function restoredResultOf(threadId: string, toolCallId: string): Promise<unknown> {
  for (let attempt = 0; attempt < STORE_POLLS; attempt += 1) {
    const result = resultOf(await threadHistory(threadId, USER), toolCallId);
    if (result !== undefined) return result;
    await Bun.sleep(STORE_POLL_MS);
  }
  return undefined;
}

function interruptOf(events: readonly SseEvent[]): string {
  const id = events.find((event) => event.type === "RUN_FINISHED" && event.outcome?.type === "interrupt")?.outcome?.interrupts?.[0]?.id;
  if (!id) throw new Error("the run raised no approval");
  return id;
}

async function askReadAndSendInOneStep(threadId: string, message: Asked = ask("ส่งยอดขายเข้าแยกตามแบรนด์ให้คุณอนุชาดู")): Promise<{ readId: string; interrupt: string }> {
  scripted.script([{ calls: [{ call: "query_metric", args: BY_BRAND }, { call: "send_card", args: SEND_ARGS }] }]);
  const events = await run(threadId, message);
  const readId = callIdOf(events, "query_metric");
  expect(events.some((event) => event.type === "TOOL_CALL_RESULT" && event.toolCallId === readId)).toBe(true);
  return { readId, interrupt: interruptOf(events) };
}

describe("a read finished in the same step as a write that waits for approval", () => {
  test("keeps its result in the restored thread while the approval waits", async () => {
    const threadId = `sibling-waiting-${Date.now()}`;
    const { readId } = await askReadAndSendInOneStep(threadId);
    expect(await restoredResultOf(threadId, readId)).toMatchObject({ rows: expect.any(Array) });
  });

  test("keeps its result after a new question leaves the approval behind, so 'send this card' still means its card", async () => {
    const threadId = `sibling-abandoned-${Date.now()}`;
    const { readId } = await askReadAndSendInOneStep(threadId);
    await restoredResultOf(threadId, readId);
    scripted.script([{ text: "ลูกหนี้ค้างไม่มีรายการ" }]);
    const next = await run(threadId, ask("เดี๋ยวก่อน ขอดูอย่างอื่นก่อน"));
    expect(next.some((event) => event.type === "RUN_ERROR")).toBe(false);
    expect(next.some((event) => event.type === "TEXT_MESSAGE_CONTENT")).toBe(true);
    expect(resultOf(await threadHistory(threadId, USER), readId)).toMatchObject({ rows: expect.any(Array) });
    expect(cardNamed(await screenCardsOn(threadId, USER, null, null, []), undefined).kind).toBe("card");
  });

  test("keeps one result after the approval is answered yes, and the answer still sends", async () => {
    const threadId = `sibling-approved-${Date.now()}`;
    const message = ask("ส่งยอดขายเข้าแยกตามแบรนด์ให้คุณอนุชาดู");
    const { readId, interrupt } = await askReadAndSendInOneStep(threadId, message);
    await restoredResultOf(threadId, readId);
    scripted.script([{ text: "ส่งแล้ว" }]);
    const answered = await run(threadId, message, interrupt);
    expect(answered.some((event) => event.type === "RUN_ERROR")).toBe(false);
    const history = await threadHistory(threadId, USER);
    expect(history.filter((entry) => entry.role === "tool" && entry.toolCallId === readId)).toHaveLength(1);
    expect(resultOf(history, readId)).toMatchObject({ rows: expect.any(Array) });
    expect(resultOf(history, callIdOf(answered, "send_card"))).toBeDefined();
  });
});
