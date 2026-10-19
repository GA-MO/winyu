import { describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { RequestContext } from "@mastra/core/request-context";
import { ScriptedModel } from "@/scripts/scripted-model";

setDefaultTimeout(30_000);

const scripted = new ScriptedModel();
mock.module("@/lib/server/models", () => scripted.modelsModule());

const { serveCopilot, LEARNING } = await import("./serve");
const { findUser } = await import("@/lib/data/entities/users");
const { liveAccessFor } = await import("@/lib/access/enforce");
const { threads, renameThread } = await import("@/lib/server/threads-read");
const { USER_ID_KEY, winyuAgent, winyuMastra } = await import("./agent");

const USER = "u_thana";
const AGENT_URL = "http://localhost/api/copilotkit/agent/winyu";
const TITLE = "ยอดขายภาคอีสานเทียบเป้า";
const QUESTION = "ยอดขายภาคอีสานเดือนนี้เทียบเป้าเป็นอย่างไร";
const SETTLE_MS = 1_500;
const POLL_MS = 50;

function access() {
  const user = findUser(USER);
  if (!user) throw new Error(`no ${USER}`);
  return liveAccessFor(user);
}

async function ask(threadId: string, question: string): Promise<{ runId: string; sse: string }> {
  const runId = crypto.randomUUID();
  const body = { threadId, runId, state: {}, messages: [{ id: crypto.randomUUID(), role: "user", content: question }], tools: [], context: [], forwardedProps: {} };
  const response = await serveCopilot(access(), new Request(`${AGENT_URL}/run`, { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(body) }), LEARNING);
  return { runId, sse: await response.text() };
}

async function titleSettles(threadId: string, expected: string): Promise<string | undefined> {
  const until = Date.now() + SETTLE_MS;
  while (Date.now() < until && threads().get(threadId)?.title !== expected) await Bun.sleep(POLL_MS);
  return threads().get(threadId)?.title;
}

describe("a thread's title", () => {
  test("after the first answer the title model names the thread, billed as background work to the person and their run, and the first question stays searchable", async () => {
    scripted.titles(`“${TITLE}”`);
    scripted.script([{ text: "ยอดขายภาคอีสานสูงกว่าเป้า" }]);
    const threadId = `title-${crypto.randomUUID()}`;
    const { runId } = await ask(threadId, QUESTION);
    expect(await titleSettles(threadId, TITLE)).toBe(TITLE);
    expect(threads().get(threadId)).toMatchObject({ titledBy: "model", question: QUESTION });
    expect(scripted.titleOwners.at(-1)).toEqual({ source: "background", userId: USER, turnId: runId });
  });

  test("a title model that never answers does not hold the reply, and the first question keeps naming the thread", async () => {
    scripted.titles(null);
    scripted.script([{ text: "ตอบแล้ว" }]);
    const threadId = `title-${crypto.randomUUID()}`;
    const started = Date.now();
    const { sse } = await ask(threadId, QUESTION);
    expect(Date.now() - started).toBeLessThan(SETTLE_MS * 2);
    expect(sse).toContain("RUN_FINISHED");
    expect(threads().get(threadId)).toMatchObject({ title: QUESTION, titledBy: "question" });
  });

  test("a thread the person renamed before the title arrives keeps their name", async () => {
    scripted.titles(TITLE);
    scripted.script([{ text: "ตอบแล้ว", delayMs: 20 }]);
    const threadId = `title-${crypto.randomUUID()}`;
    const asking = ask(threadId, QUESTION);
    await Bun.sleep(POLL_MS);
    renameThread(threadId, USER, "ของฉันเอง");
    await asking;
    await Bun.sleep(SETTLE_MS / 3);
    expect(threads().get(threadId)).toMatchObject({ title: "ของฉันเอง", titledBy: "person" });
  });

  test("a run outside a served chat (Studio) asks no title model and leaves the Mastra thread unnamed", async () => {
    scripted.titles(TITLE);
    scripted.script([{ text: "ตอบใน Studio" }]);
    const threadId = `studio-${crypto.randomUUID()}`;
    const asked = scripted.titleOwners.length;
    const requestContext = new RequestContext();
    requestContext.set(USER_ID_KEY, USER);
    const output = await winyuAgent().stream("สวัสดี", { requestContext, memory: { thread: threadId, resource: USER } });
    await output.fullStream.pipeTo(new WritableStream());
    await Bun.sleep(SETTLE_MS / 3);
    expect(scripted.titleOwners.length).toBe(asked);
    const memory = await winyuMastra().getAgent("winyu").getMemory();
    expect((await memory?.getThreadById({ threadId }))?.title ?? "").toBe("");
  });
});
