import { describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import type { Message } from "@ag-ui/core";
import { ScriptedModel } from "@/scripts/scripted-model";

setDefaultTimeout(30_000);

const scripted = new ScriptedModel();
mock.module("@/lib/server/models", () => scripted.modelsModule());

const { serveCopilot, LEARNING } = await import("./serve");
const { threadHistory, screenCardsOn } = await import("./history");
const { cardNamed } = await import("@/components/chat/card-to-share");
const { cardRefOf } = await import("@/lib/share/card");
const { findUser } = await import("@/lib/data/entities/users");
const { liveAccessFor } = await import("@/lib/access/enforce");
const { shares } = await import("@/lib/server/share/shares");

const USER = "u_thana";
const RUN_URL = "http://localhost/api/copilotkit/agent/winyu/run";
const RANGE = { from: "2026-09-01", to: "2026-09-22" };
const BY_REGION = { metric: "net_sales_value", dims: ["region"], grain: "month", range: RANGE, compare: "target", filters: {}, sort: "value_desc", limit: 10 };
const BY_BRAND = { ...BY_REGION, metric: "net_sales_volume", dims: ["brand"] };
const BY_AGENT = { ...BY_REGION, dims: ["agent"], filters: { region: ["northeast"] } };
const STORE_POLLS = 40;
const STORE_POLL_MS = 50;
const SEND_ASK = "ช่วยดูเอเย่นต์ภาคอีสาน";

type SseEvent = { type?: string; toolCallId?: string; toolCallName?: string; content?: unknown; outcome?: { type?: string; interrupts?: { id?: string }[] } };
type Asked = { id: string; content: string };

function eventsOf(sse: string): SseEvent[] {
  return sse.split("\n").flatMap((line) => (line.startsWith("data:") ? [JSON.parse(line.slice("data:".length)) as SseEvent] : []));
}

function access() {
  const user = findUser(USER);
  if (!user) throw new Error(`no ${USER}`);
  return liveAccessFor(user);
}

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

function interruptOf(events: readonly SseEvent[]): string {
  const id = events.find((event) => event.type === "RUN_FINISHED" && event.outcome?.type === "interrupt")?.outcome?.interrupts?.[0]?.id;
  if (!id) throw new Error("the run raised no approval");
  return id;
}

function resultOf(events: readonly SseEvent[], toolCallId: string): unknown {
  const content = events.find((event) => event.type === "TOOL_CALL_RESULT" && event.toolCallId === toolCallId)?.content;
  return typeof content === "string" ? JSON.parse(content) : content;
}

function storedResult(history: readonly Message[], toolCallId: string): boolean {
  return history.some((message) => message.role === "tool" && message.toolCallId === toolCallId);
}

async function untilStored(threadId: string, toolCallId: string): Promise<void> {
  for (let attempt = 0; attempt < STORE_POLLS; attempt += 1) {
    if (storedResult(await threadHistory(threadId, USER), toolCallId)) return;
    await Bun.sleep(STORE_POLL_MS);
  }
}

function sentLast() {
  return shares().where((matter) => matter.senderId === USER && matter.ask === SEND_ASK).at(-1);
}

describe("an approved send whose card was read in the same step", () => {
  test("sends the card that step drew, at once and though earlier questions left other cards on screen", async () => {
    const threadId = `same-step-${Date.now()}`;
    scripted.script([{ calls: [{ call: "query_metric", args: BY_REGION }, { call: "query_metric", args: BY_BRAND }] }, { text: "ภาคอีสานต่ำกว่าเป้า" }]);
    await run(threadId, ask("ยอดขายแยกตามภาคกับแบรนด์"));

    const message = ask("ส่งยอดเอเย่นต์อีสานให้คุณอนุชาเลย");
    scripted.script([{ calls: [{ call: "query_metric", args: BY_AGENT }, { call: "send_card", args: { to: ["u_anucha"], ask: SEND_ASK } }] }]);
    const asked = await run(threadId, message);

    scripted.script([{ text: "ส่งแล้ว" }]);
    const answered = await run(threadId, message, interruptOf(asked));
    expect(resultOf(answered, callIdOf(asked, "send_card"))).toMatchObject({ ok: true });
    await untilStored(threadId, callIdOf(asked, "query_metric"));
    const shown = cardNamed(await screenCardsOn(threadId, USER, message.id, message.content, []), undefined);
    expect(shown.kind).toBe("card");
    const sent = sentLast();
    expect(sent?.card.reads.map((read) => read.input)).toEqual([expect.objectContaining({ dims: ["agent"] })]);
    expect(sent && shown.kind === "card" ? cardRefOf(sent.card) : null).toBe(shown.kind === "card" ? shown.card.ref : "none");
  });
});
