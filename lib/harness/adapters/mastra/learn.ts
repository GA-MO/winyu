import type { MemoryFact, MetricQuery } from "@/lib/contracts";
import { injectionIn } from "@/lib/harness/guard";
import { auditLog } from "@/lib/server/audit";
import { finishTurn } from "@/lib/server/threads";
import { agUiMessagesOf, storedMessages } from "./history";
import { indexTurn } from "./recall";

/** A finished chat turn to learn from: who asked, on which thread, the question, the metric queries its answer ran, and the tools it called (asked, approved, declined or run). */
export type FinishedTurn = { userId: string; threadId: string | null; turnId: string; question: string; queries: readonly MetricQuery[]; tools: readonly string[] };

const PARAGRAPH = "\n\n";
const MEMORY_TOOLS: ReadonlySet<string> = new Set(["remember", "forget"]);
const RECALL_TOOL = "recall_memory";

/** Whether the person used the turn to tell Winyu what to remember or forget: the tool did what they asked. */
function toldWhatToRemember(turn: FinishedTurn): boolean {
  return turn.tools.some((tool) => MEMORY_TOOLS.has(tool));
}

/** Whether a turn that called these tools only recalled earlier conversations: its reply retells them and holds no query of its own, so indexing it would put a copy without data above the thread it came from (AI-345). */
export function onlyRecalled(tools: readonly string[]): boolean {
  return tools.length > 0 && tools.every((tool) => tool === RECALL_TOOL);
}

/** The words of the reply to the thread's latest question, card blocks left out; empty when the agent wrote none. */
export async function latestReplyText(threadId: string, userId: string): Promise<string> {
  const messages = agUiMessagesOf(await storedMessages(threadId, userId));
  const asked = messages.findLastIndex((message) => message.role === "user");
  return messages
    .slice(asked + 1)
    .flatMap((message) => (message.role === "assistant" && typeof message.content === "string" && message.content.trim() ? [message.content.trim()] : []))
    .join(PARAGRAPH);
}

/** Whether the turn asked for something it was refused, got only with its numbers hidden, or tried to instruct the model: what it asked for is not something the person follows, so memory does not learn from it. */
export function refusedOrInjected(turn: Pick<FinishedTurn, "userId" | "turnId" | "question">): boolean {
  if (injectionIn(turn.question).length > 0) return true;
  return auditLog().where((entry) => entry.turnId === turn.turnId && entry.userId === turn.userId).some((entry) => entry.decision !== "allow");
}

/** Everything that happens after a finished turn: the thread is touched, memory learns from the question unless the turn was refused or carried an injection, and the question and its reply become findable for later conversations; a turn that told Winyu what to remember or forget only touches the thread, because the tool already did what it asked, and a turn that only recalled is learned from but not made findable. */
export async function learnFromTurn(turn: FinishedTurn): Promise<MemoryFact[]> {
  const memoryCommand = toldWhatToRemember(turn);
  const facts = await finishTurn(turn.userId, turn.threadId, turn.question, turn.queries, { learn: !memoryCommand && !refusedOrInjected(turn) });
  if (!turn.threadId || memoryCommand || onlyRecalled(turn.tools)) return facts;
  const reply = await latestReplyText(turn.threadId, turn.userId);
  if (!reply) return facts;
  await indexTurn({ userId: turn.userId, threadId: turn.threadId, turnId: turn.turnId, at: new Date().toISOString(), question: turn.question, reply, queries: [...turn.queries] });
  return facts;
}
