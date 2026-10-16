import type { z } from "zod";
import { recallMemoryInputSchema, type MemoryFact } from "@/lib/contracts";
import { similarity } from "@/lib/engine/memory-match";
import { isUsable, memoryStatus, type MemoryStatus } from "@/lib/engine/memory-status";
import { searchConversations } from "@/lib/harness/adapters/mastra/recall";
import { TH } from "@/lib/i18n/th";
import { memoryFacts } from "@/lib/server/agent/collections";
import { maskNumbers } from "@/lib/server/recall/mask";
import type { RecalledConversation } from "@/lib/server/recall/types";
import { currentAccess, currentTurn } from "@/lib/server/request-context";
import { defineTool } from "./define";

const NO_MEMORY = "ยังไม่มีข้อมูลที่จำไว้เกี่ยวกับผู้ใช้คนนี้";
const DEFAULT_MEMORY_LIMIT = 8;
const RECALL_MIN_SIMILARITY = 0.25;
const TURNS_KEPT = 64;

type RecalledFact = MemoryFact & { status: MemoryStatus };

/** What one turn has recalled so far: every call in the turn answers with all of it, so the reply draws one memory card. */
type Recalled = { data: RecalledFact[]; conversations: RecalledConversation[] };

const recalledInTurn = new Map<string, Recalled>();

function rememberedFacts(userId: string, query: string): RecalledFact[] {
  const needle = query.toLowerCase().trim();
  return memoryFacts()
    .where((fact) => fact.userId === userId && isUsable(fact))
    .map((fact) => ({ fact, match: needle.length === 0 || fact.value.toLowerCase().includes(needle) ? 1 : similarity(needle, fact.value) }))
    .filter(({ match }) => match >= RECALL_MIN_SIMILARITY)
    .sort((left, right) => right.match - left.match || right.fact.confidence - left.fact.confidence)
    .slice(0, DEFAULT_MEMORY_LIMIT)
    .map(({ fact }) => ({ ...fact, status: memoryStatus(fact) }));
}

async function pastConversations(userId: string, query: string): Promise<RecalledConversation[]> {
  try {
    return await searchConversations(userId, query, { excludeThreadId: currentTurn().threadId });
  } catch (error) {
    console.error("conversation recall failed", error);
    return [];
  }
}

function joined<T>(earlier: readonly T[], later: readonly T[], keyOf: (item: T) => string): T[] {
  const seen = new Set(earlier.map(keyOf));
  return [...earlier, ...later.filter((item) => !seen.has(keyOf(item)))];
}

/** Everything this turn has recalled, this call included; a call outside a turn keeps only its own. */
function withEarlierCalls(userId: string, fresh: Recalled): Recalled {
  const turnId = currentTurn().turnId;
  if (!turnId) return fresh;
  const key = `${userId}:${turnId}`;
  const earlier = recalledInTurn.get(key);
  const all = earlier ? { data: joined(earlier.data, fresh.data, (fact) => fact.id), conversations: joined(earlier.conversations, fresh.conversations, (found) => found.threadId) } : fresh;
  recalledInTurn.delete(key);
  recalledInTurn.set(key, all);
  for (const stale of [...recalledInTurn.keys()].slice(0, Math.max(0, recalledInTurn.size - TURNS_KEPT))) recalledInTurn.delete(stale);
  return all;
}

function summaryOf({ data, conversations }: Recalled): string {
  if (data.length === 0 && conversations.length === 0) return NO_MEMORY;
  return TH.memory.recalledSummary(data.length, conversations.length);
}

function maskedConversation(conversation: RecalledConversation): RecalledConversation {
  return { ...conversation, title: maskNumbers(conversation.title), question: maskNumbers(conversation.question), reply: maskNumbers(conversation.reply) };
}

/** What the model reads of a recall: the person's past words with every number masked, so an old figure can never be repeated as if current, and a note that they are the past; the card shows them as said. */
export function recallForModel(output: unknown): unknown {
  if (typeof output !== "object" || output === null) return output;
  const conversations = (output as { conversations?: unknown }).conversations;
  if (!Array.isArray(conversations) || conversations.length === 0) return output;
  return { ...output, conversations: (conversations as RecalledConversation[]).map(maskedConversation), conversationsAre: TH.memory.pastConversations };
}

export const recallMemoryTool = defineTool({
  name: "recall_memory",
  connector: "winyu",
  tier: "read",
  roles: "all",
  description:
    "Search what the assistant remembers about the current user (interests, vocabulary, responsibilities, preferences, how they want answers written; only what is confirmed or heard in more than one conversation) and their past conversations. Call it once per reply, when the user refers to something from an earlier session or asks what you remember. Past conversations are what was said then, not the current state: get current numbers again with the tools.",
  input: recallMemoryInputSchema,
  redact: ["query"],
  modelView: recallForModel,
  execute: async ({ query }: z.infer<typeof recallMemoryInputSchema>) => {
    const { userId } = currentAccess();
    const recalled = withEarlierCalls(userId, { data: rememberedFacts(userId, query), conversations: await pastConversations(userId, query) });
    return { ok: true as const, summary: summaryOf(recalled), ...recalled };
  },
});
