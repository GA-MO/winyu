import type { ActionEvent, Dim, MemoryFact, MetricId, MetricQuery } from "@/lib/contracts";
import { actionEvents } from "@/lib/server/agent/collections";
import { getThread, threads } from "./threads-read";
import { rememberTurn } from "@/lib/engine/memory";

export function intentKeyOf(metric: MetricId | null, dims: Dim[]): string {
  if (!metric) return "";
  return `${metric}|${[...dims].sort().join(",")}`;
}

export function recordAction(
  userId: string,
  kind: ActionEvent["kind"],
  intentKey: string,
  prompt: string | null,
  threadId: string | null,
  subject: { metric: ActionEvent["metric"]; dims: ActionEvent["dims"] } = { metric: null, dims: [] },
): ActionEvent {
  return actionEvents().put({
    id: `ev_${kind}_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    at: new Date().toISOString(),
    kind,
    intentKey,
    metric: subject.metric,
    dims: subject.dims,
    prompt,
    threadId,
  });
}

/** After a chat turn the agent finished: the thread is touched, the question joins the behaviour log with the slice it queried first, and memory learns from it. */
export async function finishTurn(userId: string, threadId: string | null, question: string, queries: readonly MetricQuery[]): Promise<MemoryFact[]> {
  const thread = threadId ? getThread(threadId, userId) : null;
  if (thread) threads().put({ ...thread, updatedAt: new Date().toISOString() });
  const metric = queries[0]?.metric ?? null;
  const dims = queries[0]?.dims ?? [];
  recordAction(userId, "question", intentKeyOf(metric, dims), question, threadId, { metric, dims });
  return rememberTurn(userId, [{ prompt: question, metric, dims }], threadId);
}
