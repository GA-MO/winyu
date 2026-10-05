import type { MemoryFact, MetricQuery } from "@/lib/contracts";
import { finishTurn } from "@/lib/server/threads";
import { agUiMessagesOf, storedMessages } from "./history";
import { indexTurn } from "./recall";

/** A finished chat turn to learn from: who asked, on which thread, the question and the metric queries its answer ran. */
export type FinishedTurn = { userId: string; threadId: string | null; turnId: string; question: string; queries: readonly MetricQuery[] };

const PARAGRAPH = "\n\n";

/** The words of the reply to the thread's latest question, card blocks left out; empty when the agent wrote none. */
export async function latestReplyText(threadId: string, userId: string): Promise<string> {
  const messages = agUiMessagesOf(await storedMessages(threadId, userId));
  const asked = messages.findLastIndex((message) => message.role === "user");
  return messages
    .slice(asked + 1)
    .flatMap((message) => (message.role === "assistant" && typeof message.content === "string" && message.content.trim() ? [message.content.trim()] : []))
    .join(PARAGRAPH);
}

/** Everything that happens after a finished turn: the thread is touched, memory learns from the question, and the question and its reply become findable for later conversations. */
export async function learnFromTurn(turn: FinishedTurn): Promise<MemoryFact[]> {
  const facts = await finishTurn(turn.userId, turn.threadId, turn.question, turn.queries);
  if (!turn.threadId) return facts;
  const reply = await latestReplyText(turn.threadId, turn.userId);
  if (!reply) return facts;
  await indexTurn({ userId: turn.userId, threadId: turn.threadId, turnId: turn.turnId, at: new Date().toISOString(), question: turn.question, reply, queries: [...turn.queries] });
  return facts;
}
