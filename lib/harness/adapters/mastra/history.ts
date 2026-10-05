import type { Message } from "@ag-ui/core";
import { mascopAgent } from "./agent";

const RESULT_SUFFIX = ":result";
const SEGMENT_SEPARATOR = ":";

type StoredInvocation = { state?: unknown; toolCallId?: unknown; toolName?: unknown; args?: unknown; result?: unknown };
type StoredPart = { type?: unknown; text?: unknown; toolInvocation?: StoredInvocation };

/** A message as Mastra memory stores it (format 2); read loosely because it comes back from storage. */
export type StoredMessage = { id: string; role: string; content: unknown };

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type Segment = { texts: string[]; calls: ToolCall[]; results: Message[] };

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
  return { texts: [], calls: [], results: [] };
}

function segmentMessages(id: string, segment: Segment): Message[] {
  if (segment.texts.length === 0 && segment.calls.length === 0) return [];
  const assistant: Message = {
    id,
    role: "assistant",
    content: segment.texts.join("\n\n"),
    ...(segment.calls.length > 0 ? { toolCalls: segment.calls } : {}),
  };
  return [assistant, ...segment.results];
}

function invocationOf(part: StoredPart): { call: ToolCall; result: Message | null } | null {
  const invocation = part.toolInvocation;
  if (part.type !== "tool-invocation" || !invocation) return null;
  if (typeof invocation.toolCallId !== "string" || typeof invocation.toolName !== "string") return null;
  const call: ToolCall = { id: invocation.toolCallId, type: "function", function: { name: invocation.toolName, arguments: JSON.stringify(invocation.args ?? {}) } };
  if (invocation.state !== "result") return { call, result: null };
  const result: Message = { id: `${invocation.toolCallId}${RESULT_SUFFIX}`, role: "tool", toolCallId: invocation.toolCallId, content: JSON.stringify(invocation.result ?? null) };
  return { call, result };
}

/** One stored assistant message as the AG-UI messages a live run would have produced: a sentence written after a tool call starts a new message, so the reply reads in the order it was written. */
function assistantMessagesOf(message: StoredMessage): Message[] {
  const out: Message[] = [];
  let segment = emptySegment();
  let index = 0;
  const flush = () => {
    out.push(...segmentMessages(index === 0 ? message.id : `${message.id}${SEGMENT_SEPARATOR}${index}`, segment));
    if (segment.texts.length > 0 || segment.calls.length > 0) index += 1;
    segment = emptySegment();
  };
  for (const part of partsOf(message.content)) {
    if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
      if (segment.calls.length > 0) flush();
      segment.texts.push(part.text);
      continue;
    }
    const invocation = invocationOf(part);
    if (!invocation) continue;
    segment.calls.push(invocation.call);
    if (invocation.result) segment.results.push(invocation.result);
  }
  flush();
  return out;
}

/** Mastra memory's stored messages as the AG-UI transcript the chat draws: user questions, reply text, tool calls and their results. */
export function agUiMessagesOf(stored: readonly StoredMessage[]): Message[] {
  return stored.flatMap((message): Message[] => {
    if (message.role === "user") return [{ id: message.id, role: "user", content: plainTextOf(message.content) }];
    if (message.role === "assistant") return assistantMessagesOf(message);
    return [];
  });
}

async function memory() {
  const found = await mascopAgent().getMemory();
  if (!found) throw new Error("the chat agent has no memory");
  return found;
}

/** The person's saved conversation on one thread, read from Mastra memory; empty for a thread that never ran. */
export async function threadHistory(threadId: string, userId: string): Promise<Message[]> {
  const store = await memory();
  const thread = await store.getThreadById({ threadId });
  if (!thread || thread.resourceId !== userId) return [];
  const { messages } = await store.recall({ threadId, resourceId: userId, perPage: false });
  return agUiMessagesOf(messages);
}

/** Removes a thread and its messages from Mastra memory; a thread that never ran has nothing to remove. */
export async function forgetThread(threadId: string, userId: string): Promise<void> {
  const store = await memory();
  const thread = await store.getThreadById({ threadId });
  if (!thread || thread.resourceId !== userId) return;
  await store.deleteThread(threadId);
}
