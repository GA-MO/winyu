import { describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { ScriptedModel } from "@/scripts/scripted-model";

setDefaultTimeout(30_000);

const scripted = new ScriptedModel();
mock.module("@/lib/server/models", () => scripted.modelsModule());

const { serveCopilot, LEARNING } = await import("./serve");
const { threadHistory } = await import("./history");
const { findUser } = await import("@/lib/data/entities/users");
const { liveAccessFor } = await import("@/lib/access/enforce");

const USER = "u_thana";
const RUN_URL = "http://localhost/api/copilotkit/agent/winyu/run";
const BY_REGION = { metric: "net_sales_value", dims: ["region"], grain: "month", range: { from: "2026-09-01", to: "2026-09-22" }, compare: "target", filters: {}, sort: "value_desc", limit: 10 };
const SEND = { to: ["u_anucha"], ask: "ช่วยดูยอดภาคอีสาน" };

type Answer = { interruptId: string; approved: boolean };
type PromptPart = { type?: string; toolName?: string; toolCallId?: string; output?: unknown };

async function turn(threadId: string, content: string, answer: Answer | null = null): Promise<string> {
  const user = findUser(USER);
  if (!user) throw new Error(`no ${USER}`);
  const resume = answer ? { resume: [{ interruptId: answer.interruptId, status: "resolved", payload: { approved: answer.approved } }] } : {};
  const body = { threadId, runId: crypto.randomUUID(), state: {}, messages: [{ id: crypto.randomUUID(), role: "user", content }], tools: [], context: [], forwardedProps: {}, ...resume };
  const request = new Request(RUN_URL, { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(body) });
  return (await serveCopilot(liveAccessFor(user), request, LEARNING)).text();
}

function interruptOf(sse: string): { interruptId: string; toolCallId: string } {
  const match = /"interrupts":\[\{"id":"([^"]+)"[^\]]*?"toolCallId":"([^"]+)"/.exec(sse);
  if (!match) throw new Error("the run raised no approval");
  return { interruptId: match[1], toolCallId: match[2] };
}

function promptParts(): PromptPart[] {
  const prompt = scripted.model.doStreamCalls.at(-1)?.prompt ?? [];
  return prompt.flatMap((message) => (typeof message.content === "string" ? [] : (message.content as PromptPart[])));
}

describe("a new question sent while a send waits for approval", () => {
  test("reaches the model with the send closed as left behind for the new question, and the restored chat no longer holds it open", async () => {
    const threadId = `left-behind-${Date.now()}`;
    scripted.script([{ call: "query_metric", args: BY_REGION }, { call: "send_card", args: SEND }]);
    const { interruptId, toolCallId } = interruptOf(await turn(threadId, "ส่งยอดภาคให้คุณอนุชา"));

    scripted.script([{ text: "ค้างชำระ 12 ล้านบาท" }]);
    await turn(threadId, "ขอนแก่นมหาชัยค้างชำระเท่าไร", { interruptId, approved: false });

    const closed = promptParts().find((part) => part.type === "tool-result" && part.toolCallId === toolCallId);
    expect(closed?.toolName).toBe("send_card");
    expect(JSON.stringify(closed?.output)).toContain("LEFT_FOR_NEW_QUESTION");
    const restored = (await threadHistory(threadId, USER)).find((message) => message.role === "tool" && message.toolCallId === toolCallId);
    expect(restored?.role === "tool" ? JSON.parse(restored.content) : null).toMatchObject({ ok: false, code: "LEFT_FOR_NEW_QUESTION" });
  });
});
