import { COMPOSED_CARD_ACTIVITY, type ComposedSurface } from "@/lib/compose/catalog";
import { HANDOFF_REPLY_ACTIVITY, handoffReplyNoteSchema, type HandoffReplyNote } from "@/lib/contracts/handoff";
import { parsePressed, type PressedTool } from "./pressed";

/** A tool call inside an assistant message, as the agent's transcript carries it. */
export type ChatToolCall = { id: string; function: { name: string; arguments: string } };

/** One transcript message as the chat reads it; roles other than user, assistant, tool and a handoff-reply or composed-card activity are skipped. */
export type ChatMessage = { id: string; role: string; content?: unknown; toolCalls?: ChatToolCall[]; toolCallId?: string; error?: string; activityType?: string };

/** What opened an exchange: a question the person typed, or a card button that runs a tool. */
export type Question = { kind: "typed"; text: string } | ({ kind: "pressed" } & PressedTool);

/** Where a tool call stands in the transcript: no result yet, a result, or an error the runtime reported. */
export type ToolOutcome = { state: "pending" } | { state: "returned"; result: unknown } | { state: "failed"; error: string };

export type TextStep = { kind: "text"; id: string; text: string };
export type ToolStep = { kind: "tool"; toolCallId: string; name: string; args: unknown; outcome: ToolOutcome };
/** A colleague's answer to a handoff this conversation sent, drawn where it arrived. */
export type HandoffReplyStep = { kind: "handoff-reply"; id: string; note: HandoffReplyNote };
/** A card the model composed and the server checked line by line; while the reply streams it grows with each line that holds. */
export type ComposedStep = { kind: "composed"; id: string; surface: ComposedSurface };
export type ReplyStep = TextStep | ToolStep | HandoffReplyStep | ComposedStep;

/** One question and everything the agent did to answer it, in the order it happened. */
export type Exchange = { id: string; question: Question | null; steps: ReplyStep[] };

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.flatMap((part: { type?: unknown; text?: unknown }) => (part?.type === "text" && typeof part.text === "string" ? [part.text] : [])).join(" ");
}

function parsed(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function questionOf(message: ChatMessage): Question {
  const text = textOf(message.content).trim();
  const pressed = parsePressed(text);
  return pressed ? { kind: "pressed", ...pressed } : { kind: "typed", text };
}

function outcomesOf(messages: readonly ChatMessage[]): Map<string, ToolOutcome> {
  const outcomes = new Map<string, ToolOutcome>();
  for (const message of messages) {
    if (message.role !== "tool" || !message.toolCallId) continue;
    const outcome: ToolOutcome = message.error ? { state: "failed", error: message.error } : { state: "returned", result: parsed(textOf(message.content)) };
    outcomes.set(message.toolCallId, outcome);
  }
  return outcomes;
}

function assistantSteps(message: ChatMessage, outcomes: Map<string, ToolOutcome>): ReplyStep[] {
  const text = textOf(message.content).trim();
  const steps: ReplyStep[] = text ? [{ kind: "text", id: message.id, text }] : [];
  for (const call of message.toolCalls ?? []) {
    steps.push({ kind: "tool", toolCallId: call.id, name: call.function.name, args: parsed(call.function.arguments || "{}"), outcome: outcomes.get(call.id) ?? { state: "pending" } });
  }
  return steps;
}

function isComposedSurface(content: unknown): content is ComposedSurface {
  if (typeof content !== "object" || content === null) return false;
  const surface = content as Partial<ComposedSurface>;
  return typeof surface.surfaceId === "string" && Array.isArray(surface.components) && typeof surface.dataModel === "object" && surface.dataModel !== null && typeof surface.done === "boolean";
}

function activitySteps(message: ChatMessage): ReplyStep[] {
  if (message.role !== "activity") return [];
  if (message.activityType === COMPOSED_CARD_ACTIVITY) return isComposedSurface(message.content) ? [{ kind: "composed", id: message.id, surface: message.content }] : [];
  if (message.activityType !== HANDOFF_REPLY_ACTIVITY) return [];
  const parsed = handoffReplyNoteSchema.safeParse(message.content);
  return parsed.success ? [{ kind: "handoff-reply", id: message.id, note: parsed.data }] : [];
}

/** The transcript grouped into exchanges: each question with the reply text and tool calls that followed it, tool results joined to their calls. */
export function exchangesOf(messages: readonly ChatMessage[]): Exchange[] {
  const outcomes = outcomesOf(messages);
  const exchanges: Exchange[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      exchanges.push({ id: message.id, question: questionOf(message), steps: [] });
      continue;
    }
    const steps = message.role === "assistant" ? assistantSteps(message, outcomes) : activitySteps(message);
    if (steps.length === 0) continue;
    if (exchanges.length === 0) exchanges.push({ id: message.id, question: null, steps: [] });
    exchanges[exchanges.length - 1].steps.push(...steps);
  }
  return exchanges;
}

/** The newest tool result of one tool in the latest exchange; null until that tool has returned. */
export function latestResultOf(exchanges: readonly Exchange[], tool: string): { args: unknown; result: unknown } | null {
  const last = exchanges[exchanges.length - 1];
  if (!last) return null;
  for (let index = last.steps.length - 1; index >= 0; index -= 1) {
    const step = last.steps[index];
    if (step.kind === "tool" && step.name === tool && step.outcome.state === "returned") return { args: step.args, result: step.outcome.result };
  }
  return null;
}
