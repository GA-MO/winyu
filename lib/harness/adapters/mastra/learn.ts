import type { MemoryFact, MetricQuery } from "@/lib/contracts";
import { injectionIn } from "@/lib/harness/guard";
import { auditLog } from "@/lib/server/audit";
import { finishTurn } from "@/lib/server/threads";
import { agUiMessagesOf, storedMessages } from "./history";
import { indexTurn } from "./recall";

/** A finished chat turn to learn from: who asked, on which thread, the question, the metric queries its answer ran, and whether the person used it to tell Winyu what to remember or forget. */
export type FinishedTurn = { userId: string; threadId: string | null; turnId: string; question: string; queries: readonly MetricQuery[]; memoryCommand?: boolean };

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

/** Whether the turn asked for something it was refused or tried to instruct the model: what it asked for is not something the person follows, so memory does not learn from it. */
export function refusedOrInjected(turn: Pick<FinishedTurn, "userId" | "turnId" | "question">): boolean {
  if (injectionIn(turn.question).length > 0) return true;
  return auditLog().where((entry) => entry.turnId === turn.turnId && entry.userId === turn.userId).some((entry) => entry.decision === "deny");
}

/** Everything that happens after a finished turn: the thread is touched, memory learns from the question unless the turn was refused or carried an injection, and the question and its reply become findable for later conversations; a turn that told Winyu what to remember or forget only touches the thread, because the tool already did what it asked. */
export async function learnFromTurn(turn: FinishedTurn): Promise<MemoryFact[]> {
  const facts = await finishTurn(turn.userId, turn.threadId, turn.question, turn.queries, { learn: !turn.memoryCommand && !refusedOrInjected(turn) });
  if (!turn.threadId || turn.memoryCommand) return facts;
  const reply = await latestReplyText(turn.threadId, turn.userId);
  if (!reply) return facts;
  await indexTurn({ userId: turn.userId, threadId: turn.threadId, turnId: turn.turnId, at: new Date().toISOString(), question: turn.question, reply, queries: [...turn.queries] });
  return facts;
}
