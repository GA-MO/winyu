import { describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { ScriptedModel } from "@/scripts/scripted-model";

setDefaultTimeout(30_000);

const scripted = new ScriptedModel();
mock.module("@/lib/server/models", () => scripted.modelsModule());

const { serveCopilot, LEARNING } = await import("./serve");
const { findUser } = await import("@/lib/data/entities/users");
const { liveAccessFor } = await import("@/lib/access/enforce");
const { inflightRunOn } = await import("@/lib/harness/runtime");

const USER = "u_thana";
const AGENT_URL = "http://localhost/api/copilotkit/agent/winyu";
const SLOW_REPLY = "ยอดขายเดือนนี้สูงกว่าเป้า";
const MID_RUN_MS = 300;
const STREAM_DELAY_MS = 60;
const BY_REGION = { metric: "net_sales_value", dims: ["region"], grain: "month", range: { from: "2026-09-01", to: "2026-09-22" }, compare: "target", filters: {}, sort: "value_desc", limit: 10 };

type SseEvent = { type?: string; runId?: string; delta?: string; toolCallId?: string; messages?: { id: string; role: string; toolCalls?: { id: string }[] }[]; input?: { messages?: { id: string; content?: string }[] } };
type UserMessage = { id: string; role: "user"; content: string };

function eventsOf(sse: string): SseEvent[] {
  return sse.split("\n").flatMap((line) => (line.startsWith("data:") ? [JSON.parse(line.slice("data:".length)) as SseEvent] : []));
}

function access() {
  const user = findUser(USER);
  if (!user) throw new Error(`no ${USER}`);
  return liveAccessFor(user);
}

function post(route: "run" | "connect", threadId: string, runId: string, messages: UserMessage[]): Promise<Response> {
  const body = { threadId, runId, state: {}, messages, tools: [], context: [], forwardedProps: {} };
  return serveCopilot(access(), new Request(`${AGENT_URL}/${route}`, { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(body) }), LEARNING);
}

function said(content: string): UserMessage {
  return { id: crypto.randomUUID(), role: "user", content };
}

describe("a page opened while a reply is still running", () => {
  test("finds the run and joins it from its start: the thread as memory holds it, then the question and the reply as it lands, and no earlier run replayed", async () => {
    const threadId = `live-${Date.now()}`;
    const first = said("คำถามแรก");
    scripted.script([{ text: "คำตอบแรก" }]);
    await (await post("run", threadId, crypto.randomUUID(), [first])).text();

    const second = said("ยอดขายเดือนนี้เป็นอย่างไร");
    const liveRunId = crypto.randomUUID();
    scripted.script([{ text: SLOW_REPLY, delayMs: STREAM_DELAY_MS }]);
    const live = (await post("run", threadId, liveRunId, [first, second])).text();
    await Bun.sleep(MID_RUN_MS);

    expect(inflightRunOn(threadId, USER)).toBe(liveRunId);
    const joined = eventsOf(await (await post("connect", threadId, liveRunId, [])).text());
    await live;

    expect(joined[0]?.type).toBe("MESSAGES_SNAPSHOT");
    expect(joined[0]?.messages?.filter((message) => message.role === "user").map((message) => message.id)).toEqual([first.id]);
    const runs = joined.filter((event) => event.type === "RUN_STARTED").map((event) => event.runId);
    expect(runs).toEqual([liveRunId]);
    expect(joined.find((event) => event.type === "RUN_STARTED")?.input?.messages?.map((message) => message.id)).toEqual([second.id]);
    expect(joined.filter((event) => event.type === "TEXT_MESSAGE_CONTENT").map((event) => event.delta).join("")).toBe(SLOW_REPLY);
    expect(joined.at(-1)?.type).toBe("RUN_FINISHED");
    expect(inflightRunOn(threadId, USER)).toBeNull();
  });

  test("a page reopened after the live run finished a tool step gets each step once: the snapshot leaves out what the replay carries", async () => {
    const threadId = `live-steps-${Date.now()}`;
    const asked = said("ยอดขายแยกตามภาค");
    const liveRunId = crypto.randomUUID();
    scripted.script([{ call: "query_metric", args: BY_REGION }, { text: SLOW_REPLY, delayMs: STREAM_DELAY_MS }]);
    const live = (await post("run", threadId, liveRunId, [asked])).text();
    await Bun.sleep(MID_RUN_MS);

    const joined = eventsOf(await (await post("connect", threadId, liveRunId, [])).text());
    await live;
    const snapshot = joined[0]?.messages ?? [];
    const replayedCalls = joined.flatMap((event) => (event.type === "TOOL_CALL_START" && event.toolCallId ? [event.toolCallId] : []));
    expect(replayedCalls).toHaveLength(1);
    expect(snapshot.flatMap((message) => message.toolCalls ?? []).map((call) => call.id)).not.toContain(replayedCalls[0]);
    expect(snapshot.map((message) => message.id)).not.toContain(asked.id);
  });

  test("a connect that names no running run sends only the thread as memory holds it, never an empty history that would clear the chat", async () => {
    const threadId = `live-none-${Date.now()}`;
    const asked = said("คำถาม");
    scripted.script([{ text: "คำตอบ" }]);
    await (await post("run", threadId, crypto.randomUUID(), [asked])).text();
    const joined = eventsOf(await (await post("connect", threadId, crypto.randomUUID(), [])).text());
    expect(joined.map((event) => event.type)).toEqual(["MESSAGES_SNAPSHOT"]);
    expect(joined[0]?.messages?.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(joined[0]?.messages?.[0]?.id).toBe(asked.id);
  });
});
