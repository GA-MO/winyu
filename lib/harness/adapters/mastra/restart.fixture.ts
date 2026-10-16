import { expect, mock, setDefaultTimeout, test } from "bun:test";
import { ScriptedModel } from "@/scripts/scripted-model";

setDefaultTimeout(60_000);

const scripted = new ScriptedModel();
mock.module("@/lib/server/models", () => scripted.modelsModule());

const { serveCopilot, LEARNING } = await import("./serve");
const { recoverChatRuns } = await import("./recover");
const { winyuAgent } = await import("./agent");
const { findUser } = await import("@/lib/data/entities/users");
const { liveAccessFor } = await import("@/lib/access/enforce");
const { inflightRuns, runStore } = await import("@/lib/harness/runtime");
const { openApprovalsFor } = await import("@/lib/harness/approvals");
const { toolsForAccess } = await import("@/lib/server/agent/tools");

const RUN_URL = "http://localhost/api/copilotkit/agent/winyu/run";
const ADMIN = "u_ton";
const POLL_MS = 50;
const SETTLE_MS = 10_000;
const PHASE = process.env.RESTART_PHASE ?? "";
const THREAD = process.env.RESTART_THREAD ?? "";
const RUN = process.env.RESTART_RUN ?? "";
const MARKER = process.env.RESTART_MARKER ?? "";
const QUESTION = { id: process.env.RESTART_MESSAGE ?? "", content: "ปิดเครื่องมือบันทึกการเยี่ยมร้านของพนักงานขายทั้งหมด" };
const NEXT = { id: crypto.randomUUID(), content: "ขอดูสิทธิ์ของพนักงานขายตอนนี้" };
const NEXT_REPLY = "สิทธิ์ของพนักงานขายตอนนี้ยังเหมือนเดิม";
const CLOSE_VISITS = { role: "sales_rep", kind: "tool", key: "store_visits", value: "deny" };

function admin() {
  const user = findUser(ADMIN);
  if (!user) throw new Error(`no ${ADMIN}`);
  return liveAccessFor(user);
}

function runRequest(runId: string, message: { id: string; content: string }, approved: { interruptId: string } | null = null): Request {
  const resume = approved ? { resume: [{ interruptId: approved.interruptId, status: "resolved", payload: { approved: true } }] } : {};
  const body = { threadId: THREAD, runId, state: {}, messages: [{ ...message, role: "user" }], tools: [], context: [], forwardedProps: {}, ...resume };
  return new Request(RUN_URL, { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(body) });
}

function replyText(sse: string): string {
  return sse.split("\n").flatMap((line) => {
    if (!line.startsWith("data:")) return [];
    const event = JSON.parse(line.slice("data:".length)) as { type?: string; delta?: string };
    return event.type === "TEXT_MESSAGE_CONTENT" ? [event.delta ?? ""] : [];
  }).join("");
}

function repsMayVisit(): boolean {
  const rep = findUser("u_krit");
  if (!rep) throw new Error("no u_krit");
  return toolsForAccess(liveAccessFor(rep)).some((tool) => tool.entry.name === "store_visits");
}

async function until(check: () => boolean | Promise<boolean>, what: string): Promise<void> {
  const deadline = Date.now() + SETTLE_MS;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`gave up waiting: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

function ended(runId: string): boolean {
  return runStore().get(runId)?.events.some((event) => event.type === "agent.completed" || event.type === "agent.failed") ?? false;
}

function requestedTools(runId: string): string[] {
  return (runStore().get(runId)?.events ?? []).flatMap((event) => (event.type === "approval.requested" ? [event.payload.tool] : []));
}

function requestedCalls(runId: string): string[] {
  return (runStore().get(runId)?.events ?? []).flatMap((event) => (event.type === "approval.requested" ? [event.payload.toolCallId] : []));
}

test.if(PHASE === "start")("a chat run is cut off mid-reply once Mastra has checkpointed it", async () => {
  scripted.script([{ hang: true }]);
  void serveCopilot(admin(), runRequest(RUN, QUESTION), LEARNING).then((response) => response.text());
  await until(async () => (await winyuAgent().listActiveRuns()).runs.some((entry) => entry.runId === RUN), "a checkpoint of the run");
  console.log(MARKER);
  await new Promise(() => undefined);
});

test.if(PHASE === "recover")("after the restart the run raises the approval for its write and ends; the yes carries the write out once, and the thread takes the next message", async () => {
  scripted.script([{ call: "set_permission", args: CLOSE_VISITS }, { text: "ปิดให้แล้ว" }]);
  expect(await recoverChatRuns()).toContainEqual({ runId: RUN, outcome: "resumed" });
  await until(() => ended(RUN), "the resumed run to end");
  expect(requestedTools(RUN)).toEqual(["set_permission"]);
  const [asked] = openApprovalsFor(ADMIN, requestedCalls(RUN));
  expect(asked?.tool).toBe("set_permission");
  expect(inflightRuns().get(RUN)).toBeNull();
  expect(repsMayVisit()).toBe(true);

  scripted.script([{ text: "ปิดเครื่องมือบันทึกการเยี่ยมร้านให้แล้ว" }]);
  const answerRun = crypto.randomUUID();
  await (await serveCopilot(admin(), runRequest(answerRun, QUESTION, { interruptId: asked?.id ?? "" }), LEARNING)).text();
  await until(() => ended(answerRun), "the run that answers the approval to end");
  expect(repsMayVisit()).toBe(false);

  scripted.script([{ text: NEXT_REPLY }]);
  const nextRun = crypto.randomUUID();
  const reply = await (await serveCopilot(admin(), runRequest(nextRun, NEXT), LEARNING)).text();
  expect(replyText(reply)).toBe(NEXT_REPLY);
  await until(() => ended(nextRun), "the next run to end");
  expect(runStore().get(nextRun)?.events.map((event) => event.type)).toContain("agent.completed");
  await until(() => ended(RUN), "the superseded run to end in its trace");
  expect(inflightRuns().get(RUN)).toBeNull();
});

test.if(PHASE === "orphan")("a resumed run that never finishes does not block its thread: the next message is answered", async () => {
  scripted.script([{ hang: true }]);
  expect(await recoverChatRuns()).toContainEqual({ runId: RUN, outcome: "resumed" });
  await until(() => scripted.calls === 1, "the resumed run to call the model");
  scripted.script([{ text: NEXT_REPLY }]);
  const nextRun = crypto.randomUUID();
  const reply = await (await serveCopilot(admin(), runRequest(nextRun, NEXT), LEARNING)).text();
  expect(replyText(reply)).toBe(NEXT_REPLY);
  await until(() => ended(nextRun), "the next run to end");
  expect(runStore().get(nextRun)?.events.map((event) => event.type)).toContain("agent.completed");
  await until(() => ended(RUN), "the superseded run to end in its trace");
  expect(inflightRuns().get(RUN)).toBeNull();
});
