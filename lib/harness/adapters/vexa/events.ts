import type { Goal } from "@/lib/harness/types";

const QUESTION_MAX_CHARS = 300;
const PRESSED_ACTION = /^⟦action⟧\s+runTool\s+([A-Za-z0-9_]+)\s/;
const TOOL_PART_PREFIX = "tool-";

type MessagePart = { type?: unknown; text?: unknown; toolCallId?: unknown; state?: unknown; approval?: { id?: unknown; approved?: unknown } };
type Message = { id?: unknown; role?: unknown; parts?: MessagePart[] };

/** A Vexa chat request body as Winyu reads it; everything in it was sent by the browser, so every field is checked. */
export type ChatBody = { context?: { threadId?: unknown; preloadPacketId?: unknown }; messages?: Message[] } | null;

export type ApprovalAnswer = { approvalId: string; toolCallId: string; tool: string; approved: boolean };

/** What one chat request carries for the harness: the goal, the thread, the button pressed and the approvals answered. */
export type ChatTurn = { goal: Goal; threadId: string | null; preloadPacketId: string | null; question: string | null; pressedTool: string | null; approvals: ApprovalAnswer[] };

function stringOr(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function textOf(message: Message | undefined): string {
  return (message?.parts ?? []).flatMap((part) => (part.type === "text" && typeof part.text === "string" ? [part.text] : [])).join(" ").trim();
}

function lastOf(body: ChatBody, role: string): Message | undefined {
  return [...(body?.messages ?? [])].reverse().find((message) => message.role === role);
}

/** The approvals the person just answered: tool parts of the last assistant message that left the browser in the approval-responded state. */
export function approvalsOf(body: ChatBody): ApprovalAnswer[] {
  const last = body?.messages?.at(-1);
  if (last?.role !== "assistant") return [];
  return (last.parts ?? []).flatMap((part) => {
    if (part.state !== "approval-responded" || typeof part.type !== "string" || !part.type.startsWith(TOOL_PART_PREFIX)) return [];
    const toolCallId = stringOr(part.toolCallId);
    const approvalId = stringOr(part.approval?.id);
    if (!toolCallId || !approvalId) return [];
    return [{ approvalId, toolCallId, tool: part.type.slice(TOOL_PART_PREFIX.length), approved: part.approval?.approved === true }];
  });
}

/** Reads one chat request into the run's starting facts; the goal id follows the person's message so an approval's second request continues the same goal. */
export function chatTurnOf(body: ChatBody, runId: string): ChatTurn {
  const context = body?.context ?? {};
  const threadId = stringOr(context.threadId);
  const lastUser = lastOf(body, "user");
  const text = textOf(lastUser);
  const pressedTool = PRESSED_ACTION.exec(text)?.[1] ?? null;
  const question = text ? text.slice(0, QUESTION_MAX_CHARS) : null;
  const messageId = stringOr(lastUser?.id);
  return {
    goal: { id: messageId ? `${threadId ?? "unthreaded"}:${messageId}` : runId, userMessage: question ?? "", intent: pressedTool ? `ui:${pressedTool}` : null, status: "active" },
    threadId,
    preloadPacketId: stringOr(context.preloadPacketId),
    question,
    pressedTool,
    approvals: approvalsOf(body),
  };
}
