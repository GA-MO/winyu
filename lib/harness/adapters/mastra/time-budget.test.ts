import { afterAll, beforeAll, describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { ScriptedModel } from "@/scripts/scripted-model";

setDefaultTimeout(30_000);

const BUDGET_ENV = "WINYU_CHAT_BUDGET_MS";
const TEST_BUDGET = "300,1500,8000";

const scripted = new ScriptedModel();
mock.module("@/lib/server/models", () => scripted.modelsModule());

const { serveCopilot, LEARNING } = await import("./serve");
const { findUser } = await import("@/lib/data/entities/users");
const { liveAccessFor } = await import("@/lib/access/enforce");
const { inflightRunOn, runStore } = await import("@/lib/harness/runtime");
const { threadHistory } = await import("./history");

const USER = "u_thana";
const AGENT_URL = "http://localhost/api/copilotkit/agent/winyu";
const BY_REGION = { metric: "net_sales_value", dims: ["region"], grain: "month", range: { from: "2026-09-01", to: "2026-09-22" }, compare: "target", filters: {}, sort: "value_desc", limit: 10 };
const FALLBACK_REPLY = "ยอดขายเดือนนี้สูงกว่าเป้า";

type SseEvent = { type?: string; delta?: string; message?: string; toolCallId?: string; toolCallName?: string };

let savedBudget: string | undefined;

beforeAll(() => {
  savedBudget = process.env[BUDGET_ENV];
  process.env[BUDGET_ENV] = TEST_BUDGET;
});

afterAll(() => {
  if (savedBudget === undefined) delete process.env[BUDGET_ENV];
  else process.env[BUDGET_ENV] = savedBudget;
});

function access() {
  const user = findUser(USER);
  if (!user) throw new Error(`no ${USER}`);
  return liveAccessFor(user);
}

type UserMessage = { id: string; role: "user"; content: string };

function said(content: string): UserMessage {
  return { id: crypto.randomUUID(), role: "user", content };
}

async function ask(question: string | UserMessage, threadId = `budget-${crypto.randomUUID()}`): Promise<{ threadId: string; runId: string; events: SseEvent[] }> {
  const runId = crypto.randomUUID();
  const body = { threadId, runId, state: {}, messages: [typeof question === "string" ? said(question) : question], tools: [], context: [], forwardedProps: {} };
  const response = await serveCopilot(access(), new Request(`${AGENT_URL}/run`, { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(body) }), LEARNING);
  const sse = await response.text();
  const events = sse.split("\n").flatMap((line) => (line.startsWith("data:") ? [JSON.parse(line.slice("data:".length)) as SseEvent] : []));
  return { threadId, runId, events };
}

function replyOf(events: readonly SseEvent[]): string {
  return events.filter((event) => event.type === "TEXT_MESSAGE_CONTENT").map((event) => event.delta).join("");
}

function toolRunsOf(runId: string, tool: string): number {
  const run = runStore().get(runId);
  return (run?.events ?? []).filter((event) => event.type === "tool.started" && (event.payload as { tool?: string }).tool === tool).length;
}

describe("the chat's time budget", () => {
  test("a model that sends nothing within the first-chunk budget fails over to the standard tier, which answers", async () => {
    scripted.script([{ hang: true }, { text: FALLBACK_REPLY }]);
    const before = scripted.calls;
    const { events } = await ask("ยอดขายเดือนนี้เป็นอย่างไร");
    expect(scripted.calls - before).toBe(2);
    expect(replyOf(events)).toBe(FALLBACK_REPLY);
    expect(events.at(-1)?.type).toBe("RUN_FINISHED");
  });

  test("a run whose every model stalls ends in a run error that says it timed out, and leaves nothing in flight", async () => {
    scripted.script([{ hang: true }, { hang: true }]);
    const { threadId, runId, events } = await ask("ยอดขายภาคเหนือ");
    const failure = events.find((event) => event.type === "RUN_ERROR");
    expect(failure?.message).toContain("timed out");
    expect(inflightRunOn(threadId, USER)).toBeNull();
    expect(runStore().get(runId)?.events.some((event) => event.type === "agent.failed")).toBe(true);
  });

  test("asking again after a run timed out answers that question once: the model reads it once and memory keeps it once", async () => {
    const question = said("ยอดขายภาคใต้เดือนนี้");
    scripted.script([{ hang: true }, { hang: true }]);
    const failed = await ask(question);
    expect(failed.events.some((event) => event.type === "RUN_ERROR")).toBe(true);
    scripted.script([{ text: FALLBACK_REPLY }]);
    const retried = await ask(question, failed.threadId);
    expect(replyOf(retried.events)).toBe(FALLBACK_REPLY);
    const prompt = JSON.stringify(scripted.model.doStreamCalls.at(-1)?.prompt ?? []);
    expect(prompt.split(question.content).length - 1).toBe(1);
    const kept = await threadHistory(failed.threadId, USER);
    expect(kept.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(kept[0]?.id).toBe(question.id);
  });

  test("a step that goes silent after asking for a tool never runs that call, and the person never sees it start; the fallback's own call runs once", async () => {
    scripted.script([{ silentAfter: { call: "query_metric", args: BY_REGION } }, { call: "query_metric", args: BY_REGION }, { text: FALLBACK_REPLY }]);
    const { runId, events } = await ask("ยอดขายแยกตามภาค");
    expect(toolRunsOf(runId, "query_metric")).toBe(1);
    const shownCalls = new Set(events.filter((event) => event.type?.startsWith("TOOL_CALL")).map((event) => event.toolCallId));
    const answered = events.filter((event) => event.type === "TOOL_CALL_RESULT").map((event) => event.toolCallId);
    expect([...shownCalls]).toEqual(answered);
    expect(replyOf(events)).toBe(FALLBACK_REPLY);
    expect(events.at(-1)?.type).toBe("RUN_FINISHED");
  });
});
