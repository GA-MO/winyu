import type { Message } from "@ag-ui/core";
import type { MastraDBMessage, MastraMessagePart } from "@mastra/core/agent/message-list";
import { screenCardsEach } from "@/components/chat/card-to-share";
import { exchangesOf, type Exchange, type ToolStep } from "@/components/chat/timeline";
import { openApprovalsFor } from "@/lib/harness/approvals";
import type { ScreenCards } from "@/lib/share/card";
import { toolTiers } from "@/lib/server/agent/tools";
import type { FinishedCall, SpokenTurn } from "@/lib/server/request-context";
import { ReplyCards, type CarriedCall, type StreamEvent } from "./card-stream";
import type { FinishedResult } from "./turn";

const RESULT_SUFFIX = ":result";
const SEGMENT_SEPARATOR = ":";
const DENIED = "output-denied";
const CALLED = "call";
const PAUSED = "suspended";
const PAUSE_POLLS = 100;
const PAUSE_POLL_MS = 20;
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

/** Mastra memory's stored messages as the AG-UI transcript the chat draws: user questions, reply text, and tool calls with their results. */
export function agUiMessagesOf(stored: readonly StoredMessage[]): Message[] {
  let cards = turnCards();
  return stored.flatMap((message): Message[] => {
    if (message.role === "user") {
      cards = turnCards();
      return [{ id: message.id, role: "user", content: plainTextOf(message.content) }];
    }
    if (message.role === "assistant") return assistantMessagesOf(message, cards);
    return [];
  });
}

async function memory() {
  const { winyuAgent } = await import("./agent");
  const found = await winyuAgent().getMemory();
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

function withResult(part: MastraMessagePart, outputs: ReadonlyMap<string, unknown>): MastraMessagePart {
  if (part.type !== "tool-invocation" || part.toolInvocation.state !== CALLED || !outputs.has(part.toolInvocation.toolCallId)) return part;
  return { ...part, toolInvocation: { ...part.toolInvocation, state: "result", result: outputs.get(part.toolInvocation.toolCallId) } };
}

function completed(message: MastraDBMessage, outputs: ReadonlyMap<string, unknown>): MastraDBMessage[] {
  const parts = message.content.parts.map((part) => withResult(part, outputs));
  return parts.some((part, index) => part !== message.content.parts[index]) ? [{ ...message, content: { ...message.content, parts } }] : [];
}

async function pauseStored(runId: string): Promise<void> {
  const [{ winyuMastra }, { DurableStepIds }] = await Promise.all([import("./agent"), import("@mastra/core/agent/durable")]);
  const workflows = await winyuMastra().getStorage()?.getStore("workflows");
  for (let attempt = 0; workflows && attempt < PAUSE_POLLS; attempt += 1) {
    const snapshot = await workflows.loadWorkflowSnapshot({ workflowName: DurableStepIds.AGENTIC_LOOP, runId });
    if (snapshot?.status === PAUSED) return;
    await new Promise((resolve) => setTimeout(resolve, PAUSE_POLL_MS));
  }
}

/** Stores the results a paused run returned for calls memory still holds without one. Mastra saves a step's message when a call in it pauses for approval, before the step's finished calls get their results, and only an answer to that approval adds them; a run left waiting, or left behind by a new question, would otherwise lose the cards those calls drew from the restored thread. The write waits until Mastra has stored the pause, which it does after saving that message, so its save cannot overwrite this one. */
export async function keepFinishedResults(runId: string, threadId: string, userId: string, finished: readonly FinishedResult[]): Promise<void> {
  if (finished.length === 0) return;
  const outputs = new Map(finished.map((call) => [call.toolCallId, call.output]));
  await pauseStored(runId);
  const store = await memory();
  const thread = await store.getThreadById({ threadId });
  if (!thread || thread.resourceId !== userId) return;
  const { messages } = await store.recall({ threadId, resourceId: userId, perPage: false });
  const updated = messages.flatMap((message) => completed(message, outputs));
  if (updated.length > 0) await store.saveMessages({ messages: updated });
}

/** The person's saved conversation on one thread, read from Mastra memory; empty for a thread that never ran. */
export async function threadHistory(threadId: string, userId: string): Promise<Message[]> {
  return agUiMessagesOf(await storedMessages(threadId, userId));
}

function finishedCallsOf(message: StoredMessage): CarriedCall[] {
  return partsOf(message.content).flatMap((part) => {
    const invocation = part.toolInvocation;
    if (part.type !== "tool-invocation" || invocation?.state !== "result") return [];
    if (typeof invocation.toolCallId !== "string" || typeof invocation.toolName !== "string") return [];
    return [{ toolCallId: invocation.toolCallId, tool: invocation.toolName, args: invocation.args ?? null, output: invocation.result ?? null }];
  });
}

/** The tool calls earlier runs finished while answering one question (the person's message `messageId`), in call order, read from memory: the run that answers an approval continues the run that asked, as a restored thread already reads them. */
export async function callsAnswering(threadId: string, userId: string, messageId: string): Promise<CarriedCall[]> {
  const stored = await storedMessages(threadId, userId);
  const asked = stored.findIndex((message) => message.role === "user" && message.id === messageId);
  if (asked < 0) return [];
  const after = stored.slice(asked + 1);
  const nextQuestion = after.findIndex((message) => message.role === "user");
  return (nextQuestion < 0 ? after : after.slice(0, nextQuestion)).filter((message) => message.role === "assistant").flatMap(finishedCallsOf);
}

function metricOf(call: { function: { arguments: string } }): string[] {
  try {
    const metric = (JSON.parse(call.function.arguments) as { metric?: unknown }).metric;
    return typeof metric === "string" ? [metric] : [];
  } catch {
    return [];
  }
}

/** The thread's questions and reply text as plain lines, each reply with the metrics its tool calls read, for a handoff to summarise. */
export async function threadTranscript(threadId: string, userId: string): Promise<SpokenTurn[]> {
  const messages = await threadHistory(threadId, userId);
  return messages.flatMap((message): SpokenTurn[] => {
    if (message.role === "user" && typeof message.content === "string") return [{ role: message.role, text: message.content }];
    if (message.role !== "assistant") return [];
    return [{ role: message.role, text: typeof message.content === "string" ? message.content : "", metrics: (message.toolCalls ?? []).flatMap(metricOf) }];
  });
}

function readTools(): ReadonlySet<string> {
  const tiers = toolTiers();
  return new Set(Object.keys(tiers).filter((tool) => tiers[tool] === "read"));
}

function toolStepOf(call: FinishedCall): ToolStep {
  return { kind: "tool", toolCallId: call.toolCallId, name: call.tool, args: call.args, outcome: { state: "returned", result: call.output } };
}

/** The exchanges with the one being answered (`messageId`) carrying the calls this run finished that memory does not hold yet: a run's calls reach memory only when the run ends, and a send in it must see the card it drew. */
function withFinished(exchanges: readonly Exchange[], messageId: string, question: string | null, finished: readonly FinishedCall[]): Exchange[] {
  const index = exchanges.findIndex((exchange) => exchange.id === messageId);
  const current: Exchange = index >= 0 ? exchanges[index] : { id: messageId, question: question ? { kind: "typed", text: question } : null, steps: [] };
  const known = new Set(current.steps.flatMap((step) => (step.kind === "tool" ? [step.toolCallId] : [])));
  const answered: Exchange = { ...current, steps: [...current.steps, ...finished.filter((call) => !known.has(call.toolCallId)).map(toolStepOf)] };
  return index >= 0 ? exchanges.map((exchange, at) => (at === index ? answered : exchange)) : [...exchanges, answered];
}

/** The cards on screen on this thread when the person asked `messageId`: what earlier questions drew and what this one drew so far (`finished` holds this run's calls), the cards a send may name. */
export async function screenCardsOn(threadId: string, userId: string, messageId: string | null, question: string | null, finished: readonly FinishedCall[]): Promise<ScreenCards> {
  const history = exchangesOf(await threadHistory(threadId, userId));
  const exchanges = messageId ? withFinished(history, messageId, question, finished) : history;
  const each = screenCardsEach(exchanges, readTools());
  return each.find((screen) => screen.exchangeId === messageId) ?? each.at(-1) ?? { exchangeId: messageId, cards: [], warned: false };
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
