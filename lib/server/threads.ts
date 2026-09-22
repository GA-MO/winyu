import type { ActionEvent, Dim, MemoryFact, MetricId, Thread } from "@/lib/contracts";
import { actionEvents } from "@/lib/server/agent/collections";
import { getThread, threads, titleFrom } from "./threads-read";
import { rememberTurn } from "@/lib/engine/memory";

const TOOL_PREFIX = "tool-";
const QUERY_TOOL = "tool-query_metric";

type MessageLike = { id?: string; role?: string; parts?: MessagePart[] };
type MessagePart = { type?: string; text?: string; input?: unknown };

export type Turn = { prompt: string; answer: string; intentKey: string; metric: MetricId | null; dims: Dim[] };

function textOf(message: MessageLike): string {
  return (message.parts ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join(" ")
    .trim();
}

function queriesOf(message: MessageLike): { metric: MetricId; dims: Dim[] }[] {
  return (message.parts ?? [])
    .filter((part) => part.type === QUERY_TOOL && part.input)
    .map((part) => part.input as { metric?: MetricId; dims?: Dim[] })
    .filter((input): input is { metric: MetricId; dims: Dim[] } => Boolean(input.metric))
    .map((input) => ({ metric: input.metric, dims: input.dims ?? [] }));
}

function toolsOf(message: MessageLike): string[] {
  return (message.parts ?? [])
    .map((part) => part.type ?? "")
    .filter((type) => type.startsWith(TOOL_PREFIX))
    .map((type) => type.slice(TOOL_PREFIX.length));
}

export function intentKeyOf(metric: MetricId | null, dims: Dim[]): string {
  if (!metric) return "";
  return `${metric}|${[...dims].sort().join(",")}`;
}

/** One user question with the answer that followed it and the metric slice the answer was built from. */
export function turnsOf(messages: unknown[]): Turn[] {
  const list = messages as MessageLike[];
  const turns: Turn[] = [];
  for (let index = 0; index < list.length; index += 1) {
    const message = list[index] as MessageLike;
    if (message.role !== "user") continue;
    const prompt = textOf(message);
    if (!prompt) continue;
    let answer = "";
    const queries: { metric: MetricId; dims: Dim[] }[] = [];
    for (let ahead = index + 1; ahead < list.length && (list[ahead] as MessageLike).role !== "user"; ahead += 1) {
      const reply = list[ahead] as MessageLike;
      answer = answer || textOf(reply);
      queries.push(...queriesOf(reply));
    }
    const primary = queries[0] ?? null;
    turns.push({
      prompt,
      answer,
      intentKey: intentKeyOf(primary?.metric ?? null, primary?.dims ?? []),
      metric: primary?.metric ?? null,
      dims: primary?.dims ?? [],
    });
  }
  return turns;
}

function eventIdOf(threadId: string, index: number): string {
  return `ev_${threadId}_${index}`;
}

function recordEvents(thread: Thread, turns: Turn[]): void {
  const store = actionEvents();
  turns.forEach((turn, index) => {
    const id = eventIdOf(thread.id, index);
    if (store.get(id)) return;
    const event: ActionEvent = {
      id,
      userId: thread.userId,
      at: new Date().toISOString(),
      kind: "question",
      intentKey: turn.intentKey,
      metric: turn.metric,
      dims: turn.dims,
      prompt: turn.prompt,
      threadId: thread.id,
    };
    store.put(event);
  });
}

export function recordAction(userId: string, kind: ActionEvent["kind"], intentKey: string, prompt: string | null, threadId: string | null): ActionEvent {
  return actionEvents().put({
    id: `ev_${kind}_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    at: new Date().toISOString(),
    kind,
    intentKey,
    metric: null,
    dims: [],
    prompt,
    threadId,
  });
}

export type SaveResult = { thread: Thread; facts: MemoryFact[] };

/** Persists a conversation and folds it into the behaviour log and the memory the persona reads. */
export async function saveMessages(threadId: string, userId: string, messages: unknown[]): Promise<SaveResult | null> {
  const thread = getThread(threadId, userId);
  if (!thread) return null;
  const turns = turnsOf(messages);
  const title = thread.title && turns.length === 0 ? thread.title : titleFrom(turns[0]?.prompt ?? thread.title);
  const saved = threads().put({ ...thread, title, messages, updatedAt: new Date().toISOString() });
  recordEvents(saved, turns);
  const facts = await rememberTurn(userId, turns, threadId);
  return { thread: saved, facts };
}

export function toolsUsed(messages: unknown[]): string[] {
  return [...new Set((messages as MessageLike[]).flatMap(toolsOf))];
}
