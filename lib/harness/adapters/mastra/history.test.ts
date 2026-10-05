import { describe, expect, test } from "bun:test";
import { recordAsked, markAnswered } from "@/lib/harness/approvals";
import { agUiMessagesOf, openApprovalsOf, type StoredMessage } from "./history";

const QUESTION: StoredMessage = { id: "u1", role: "user", content: { format: 2, parts: [{ type: "text", text: "ยอดขายแยกตามภาค" }] } };

function invocation(toolCallId: string, toolName: string, state: string, result?: unknown) {
  return { type: "tool-invocation", toolInvocation: { state, toolCallId, toolName, args: { metric: "net_sales_value" }, ...(result === undefined ? {} : { result }) } };
}

function reply(parts: unknown[]): StoredMessage {
  return { id: "a1", role: "assistant", content: { format: 2, parts } };
}

describe("agUiMessagesOf", () => {
  test("a sentence written after a tool call starts a new assistant message, so the restored reply reads in the order it was written", () => {
    const messages = agUiMessagesOf([
      QUESTION,
      reply([{ type: "step-start" }, { type: "text", text: "ขอดูให้ครับ" }, invocation("c1", "query_metric", "result", { ok: true, rows: [] }), { type: "reasoning", reasoning: "…" }, { type: "text", text: "อีสานต่ำกว่าเป้า" }]),
    ]);
    expect(messages.map((message) => [message.role, message.id])).toEqual([
      ["user", "u1"],
      ["assistant", "a1"],
      ["tool", "c1:result"],
      ["assistant", "a1:1"],
    ]);
    expect(messages[1]).toMatchObject({ content: "ขอดูให้ครับ", toolCalls: [{ id: "c1", function: { name: "query_metric" } }] });
    expect(messages[2]).toMatchObject({ toolCallId: "c1", content: JSON.stringify({ ok: true, rows: [] }) });
    expect(messages[3]).toMatchObject({ content: "อีสานต่ำกว่าเป้า" });
  });

  test("a declined call comes back as a declined result and a paused call has no result", () => {
    const messages = agUiMessagesOf([QUESTION, reply([invocation("c1", "send_email", "output-denied"), invocation("c2", "pin_widget", "call")])]);
    const results = messages.filter((message) => message.role === "tool");
    expect(results).toEqual([{ id: "c1:result", role: "tool", toolCallId: "c1", content: JSON.stringify({ approved: false }) }]);
  });
});

describe("openApprovalsOf", () => {
  test("a paused call the person was asked about and has not answered comes back with its interrupt; answered or someone else's do not", () => {
    const messages = agUiMessagesOf([QUESTION, reply([invocation("c-open", "pin_widget", "call"), invocation("c-spent", "pin_widget", "call"), invocation("c-other", "pin_widget", "call")])]);
    recordAsked("mastra-approval::r::c-open", "u_thana", "c-open", "pin_widget");
    recordAsked("mastra-approval::r::c-spent", "u_thana", "c-spent", "pin_widget");
    markAnswered("mastra-approval::r::c-spent");
    recordAsked("mastra-approval::r::c-other", "u_krit", "c-other", "pin_widget");
    expect(openApprovalsOf(messages, "u_thana")).toEqual([
      { interruptId: "mastra-approval::r::c-open", toolCallId: "c-open", tool: "pin_widget", input: { metric: "net_sales_value" }, exchangeId: "u1", position: Number.MAX_SAFE_INTEGER },
    ]);
  });
});
