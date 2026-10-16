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

type SseEvent = { type?: string; runId?: string; delta?: string; input?: { messages?: { id: string; content?: string }[] } };
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
  test("finds the run and joins it from its start: the question, the reply as it lands, and none of the runs memory already restored", async () => {
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

    const runs = joined.filter((event) => event.type === "RUN_STARTED").map((event) => event.runId);
    expect(runs).toEqual([liveRunId]);
    expect(joined.find((event) => event.type === "RUN_STARTED")?.input?.messages?.map((message) => message.id)).toEqual([second.id]);
    expect(joined.filter((event) => event.type === "TEXT_MESSAGE_CONTENT").map((event) => event.delta).join("")).toBe(SLOW_REPLY);
    expect(joined.at(-1)?.type).toBe("RUN_FINISHED");
    expect(inflightRunOn(threadId, USER)).toBeNull();
  });

  test("a connect that names no run the thread held replays nothing", async () => {
    const threadId = `live-none-${Date.now()}`;
    scripted.script([{ text: "คำตอบ" }]);
    await (await post("run", threadId, crypto.randomUUID(), [said("คำถาม")])).text();
    expect(eventsOf(await (await post("connect", threadId, crypto.randomUUID(), [])).text())).toEqual([]);
  });
});
