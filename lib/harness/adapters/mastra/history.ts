import { randomUUID } from "node:crypto";
import type { Message } from "@ag-ui/core";
import { HANDOFF_REPLY_ACTIVITY, handoffReplyNoteSchema, type HandoffReplyNote } from "@/lib/contracts";
import { openApprovalsFor } from "@/lib/harness/approvals";
import { fenceAsData } from "@/lib/harness/fence";
import { TH } from "@/lib/i18n/th";
import { toolTiers } from "@/lib/server/agent/tools";
import type { SpokenTurn } from "@/lib/server/request-context";
import { mascopAgent } from "./agent";
import { ReplyCards, type StreamEvent } from "./card-stream";

const RESULT_SUFFIX = ":result";
const SEGMENT_SEPARATOR = ":";
const DENIED = "output-denied";
const DECLINED = { approved: false };

type StoredInvocation = { state?: unknown; toolCallId?: unknown; toolName?: unknown; args?: unknown; result?: unknown };
type StoredPart = { type?: unknown; text?: unknown; toolInvocation?: StoredInvocation };

/** A message as Mastra memory stores it (format 2); read loosely because it comes back from storage. */
export type StoredMessage = { id: string; role: string; content: unknown };

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type Segment = { texts: string[]; calls: ToolCall[]; results: Message[]; cards: Message[] };

function partsOf(content: unknown): StoredPart[] {
  if (typeof content !== "object" || content === null) return [];
  const parts = (content as { parts?: unknown }).parts;
  return Array.isArray(parts) ? (parts as StoredPart[]) : [];
}

function plainTextOf(content: unknown): string {
  if (typeof content === "string") return content;
  const texts = partsOf(content).flatMap((part) => (part.type === "text" && typeof part.text === "string" ? [part.text] : []));
  if (texts.length > 0) return texts.join("\n");
  const fallback = typeof content === "object" && content !== null ? (content as { content?: unknown }).content : null;
  return typeof fallback === "string" ? fallback : "";
}

function emptySegment(): Segment {
  return { texts: [], calls: [], results: [], cards: [] };
}

function readTool(tiers: Record<string, string>): (tool: string) => boolean {
  return (tool) => tiers[tool] === "read";
}

/** A new turn's card reader: the same one the live stream uses, so a restored card is checked line by line against the same results as the live one. */
function turnCards(): ReplyCards {
  return new ReplyCards(readTool(toolTiers()), () => undefined);
}

function cardMessage(event: StreamEvent): Message[] {
  const content = event.content as { components?: unknown[] } | undefined;
  if (typeof event.messageId !== "string" || !content?.components?.length) return [];
  return [{ id: event.messageId, role: "activity", activityType: String(event.activityType), content: content as Record<string, unknown> }];
}

/** One stored reply text read the way the live stream read it: the words without the card block, and the card the block left. */
function readStoredText(cards: ReplyCards, messageId: string, text: string): { text: string; cards: Message[] } {
  const out = [...cards.next({ type: "TEXT_MESSAGE_CONTENT", messageId, delta: text }), ...cards.next({ type: "TEXT_MESSAGE_END", messageId })];
  const shown = out.flatMap((event) => (event.type === "TEXT_MESSAGE_CONTENT" && typeof event.delta === "string" ? [event.delta] : [])).join("");
  const finals = new Map(out.filter((event) => event.type === "ACTIVITY_SNAPSHOT").map((event) => [String(event.messageId), event]));
  return { text: shown, cards: [...finals.values()].flatMap(cardMessage) };
}

function segmentMessages(id: string, segment: Segment): Message[] {
  if (segment.texts.length === 0 && segment.calls.length === 0) return segment.cards;
  const assistant: Message = {
    id,
    role: "assistant",
    content: segment.texts.join("\n\n"),
    ...(segment.calls.length > 0 ? { toolCalls: segment.calls } : {}),
  };
  return [assistant, ...segment.results, ...segment.cards];
}

function invocationOf(part: StoredPart): { call: ToolCall; result: Message | null } | null {
  const invocation = part.toolInvocation;
  if (part.type !== "tool-invocation" || !invocation) return null;
  if (typeof invocation.toolCallId !== "string" || typeof invocation.toolName !== "string") return null;
  const call: ToolCall = { id: invocation.toolCallId, type: "function", function: { name: invocation.toolName, arguments: JSON.stringify(invocation.args ?? {}) } };
  const outcome = invocation.state === "result" ? (invocation.result ?? null) : invocation.state === DENIED ? DECLINED : undefined;
  if (outcome === undefined) return { call, result: null };
  return { call, result: { id: `${invocation.toolCallId}${RESULT_SUFFIX}`, role: "tool", toolCallId: invocation.toolCallId, content: JSON.stringify(outcome) } };
}

/** One stored assistant message as the AG-UI messages a live run would have produced: a sentence written after a tool call starts a new message, so the reply reads in the order it was written, and a card block in the text comes back as the card the live stream drew. */
function assistantMessagesOf(message: StoredMessage, cards: ReplyCards): Message[] {
  const out: Message[] = [];
  let segment = emptySegment();
  let index = 0;
  const segmentId = () => (index === 0 ? message.id : `${message.id}${SEGMENT_SEPARATOR}${index}`);
  const flush = () => {
    out.push(...segmentMessages(segmentId(), segment));
    if (segment.texts.length > 0 || segment.calls.length > 0) index += 1;
    segment = emptySegment();
  };
  for (const part of partsOf(message.content)) {
    if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
      if (segment.calls.length > 0) flush();
      const read = readStoredText(cards, segmentId(), part.text);
      if (read.text.trim()) segment.texts.push(read.text);
      segment.cards.push(...read.cards);
      continue;
    }
    const invocation = invocationOf(part);
    if (!invocation) continue;
    segment.calls.push(invocation.call);
    if (!invocation.result) continue;
    segment.results.push(invocation.result);
    cards.next({ type: "TOOL_CALL_START", toolCallId: invocation.call.id, toolCallName: invocation.call.function.name });
    cards.next({ type: "TOOL_CALL_RESULT", toolCallId: invocation.call.id, content: part.toolInvocation?.result });
  }
  flush();
  return out;
}

function handoffReplyOf(content: unknown): HandoffReplyNote | null {
  if (typeof content !== "object" || content === null) return null;
  const metadata = (content as { metadata?: unknown }).metadata;
  if (typeof metadata !== "object" || metadata === null) return null;
  const parsed = handoffReplyNoteSchema.safeParse((metadata as Record<string, unknown>)[HANDOFF_REPLY_ACTIVITY]);
  return parsed.success ? parsed.data : null;
}

/** Mastra memory's stored messages as the AG-UI transcript the chat draws: user questions, reply text, tool calls and their results, and a colleague's handoff reply as an activity, never as a question or as the agent's words. */
export function agUiMessagesOf(stored: readonly StoredMessage[]): Message[] {
  let cards = turnCards();
  return stored.flatMap((message): Message[] => {
    const reply = message.role === "user" ? handoffReplyOf(message.content) : null;
    if (reply) return [{ id: message.id, role: "activity", activityType: HANDOFF_REPLY_ACTIVITY, content: reply }];
    if (message.role === "user") {
      cards = turnCards();
      return [{ id: message.id, role: "user", content: plainTextOf(message.content) }];
    }
    if (message.role === "assistant") return assistantMessagesOf(message, cards);
    return [];
  });
}

async function memory() {
  const found = await mascopAgent().getMemory();
  if (!found) throw new Error("the chat agent has no memory");
  return found;
}

/** One thread's messages exactly as Mastra memory stored them, card blocks and tool invocations included; empty for another person's thread or one that never ran. */
export async function storedMessages(threadId: string, userId: string): Promise<StoredMessage[]> {
  const store = await memory();
  const thread = await store.getThreadById({ threadId });
  if (!thread || thread.resourceId !== userId) return [];
  const { messages } = await store.recall({ threadId, resourceId: userId, perPage: false });
  return messages;
}

/** The person's saved conversation on one thread, read from Mastra memory; empty for a thread that never ran. */
export async function threadHistory(threadId: string, userId: string): Promise<Message[]> {
  return agUiMessagesOf(await storedMessages(threadId, userId));
}

/** The thread's questions and reply text as plain lines, for a handoff to summarise. */
export async function threadTranscript(threadId: string, userId: string): Promise<SpokenTurn[]> {
  const messages = await threadHistory(threadId, userId);
  return messages.flatMap((message) => ((message.role === "user" || message.role === "assistant") && typeof message.content === "string" ? [{ role: message.role, text: message.content }] : []));
}

/** What the model reads for a handoff reply: a labelled system note with the colleague's words fenced as data. */
export function handoffReplyForModel(note: HandoffReplyNote): string {
  const words = fenceAsData(`${TH.handoff.replyAbout(note.packetTitle)}\n${note.text}`);
  return TH.handoff.replyForModel(note.fromName, note.fromTitle, TH.inbox.status[note.status], words);
}

/** Appends a colleague's handoff reply to the sender's conversation in Mastra memory, so it is in the restored thread and in what the agent remembers; a thread that never ran or is someone else's is left alone. Returns whether it was written. */
export async function appendHandoffReply(threadId: string, userId: string, note: HandoffReplyNote): Promise<boolean> {
  const store = await memory();
  const thread = await store.getThreadById({ threadId });
  if (!thread || thread.resourceId !== userId) return false;
  const content = { format: 2 as const, parts: [{ type: "text" as const, text: handoffReplyForModel(note) }], metadata: { [HANDOFF_REPLY_ACTIVITY]: note } };
  await store.saveMessages({ messages: [{ id: randomUUID(), role: "user", createdAt: new Date(note.at), threadId, resourceId: userId, type: "text", content }] });
  return true;
}

/** Removes a thread and its messages from Mastra memory; a thread that never ran has nothing to remove. */
export async function forgetThread(threadId: string, userId: string): Promise<void> {
  const store = await memory();
  const thread = await store.getThreadById({ threadId });
  if (!thread || thread.resourceId !== userId) return;
  await store.deleteThread(threadId);
}

/** An approval the agent asked on this thread that the person has not answered yet: enough for the chat to draw the decision again and resume the paused run. */
export type OpenApproval = { interruptId: string; toolCallId: string; tool: string; input: unknown; exchangeId: string | null; position: number };

function argsOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/** The tool calls of the latest question that are still paused for the person's answer; asking something new leaves an older approval behind for good. */
export function openApprovalsOf(messages: readonly Message[], userId: string): OpenApproval[] {
  const answered = new Set(messages.flatMap((message) => (message.role === "tool" ? [message.toolCallId] : [])));
  const waiting = new Map<string, { tool: string; input: unknown; exchangeId: string | null; position: number }>();
  const latest = messages.findLastIndex((message) => message.role === "user");
  let exchangeId: string | null = null;
  for (const message of messages.slice(Math.max(latest, 0))) {
    if (message.role === "user") exchangeId = message.id;
    if (message.role !== "assistant") continue;
    for (const call of message.toolCalls ?? []) {
      if (!answered.has(call.id)) waiting.set(call.id, { tool: call.function.name, input: argsOf(call.function.arguments), exchangeId, position: Number.MAX_SAFE_INTEGER });
    }
  }
  return openApprovalsFor(userId, [...waiting.keys()]).flatMap((record) => {
    const call = waiting.get(record.toolCallId);
    return call ? [{ interruptId: record.id, toolCallId: record.toolCallId, ...call }] : [];
  });
}
