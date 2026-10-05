import type { z } from "zod";
import { recallMemoryInputSchema } from "@/lib/contracts";
import { similarity } from "@/lib/engine/memory-match";
import { memoryStatus } from "@/lib/engine/memory-status";
import { searchConversations } from "@/lib/harness/adapters/mastra/recall";
import { TH } from "@/lib/i18n/th";
import { memoryFacts } from "@/lib/server/agent/collections";
import type { RecalledConversation } from "@/lib/server/recall/types";
import { currentAccess, currentTurn } from "@/lib/server/request-context";
import { defineTool } from "./define";

const NO_MEMORY = "ยังไม่มีข้อมูลที่จำไว้เกี่ยวกับผู้ใช้คนนี้";
const DEFAULT_MEMORY_LIMIT = 8;
const RECALL_MIN_SIMILARITY = 0.25;

function rememberedFacts(userId: string, query: string) {
  const needle = query.toLowerCase().trim();
  return memoryFacts()
    .where((fact) => fact.userId === userId)
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

export const recallMemoryTool = defineTool({
  name: "recall_memory",
  connector: "winyu",
  tier: "read",
  roles: "all",
  description: "Search what the assistant remembers about the current user: interests, vocabulary, responsibilities, preferences. Call it when the user refers to something from an earlier session or asks what you remember.",
  input: recallMemoryInputSchema,
  redact: ["query"],
  execute: async ({ query }: z.infer<typeof recallMemoryInputSchema>) => {
    const { userId } = currentAccess();
    const data = rememberedFacts(userId, query);
    const conversations = await pastConversations(userId, query);
    if (data.length === 0 && conversations.length === 0) return { ok: true as const, summary: NO_MEMORY, data, conversations };
    return { ok: true as const, summary: TH.memory.recalledSummary(data.length, conversations.length), data, conversations };
  },
});
