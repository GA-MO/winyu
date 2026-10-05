import type { z } from "zod";
import { recallMemoryInputSchema } from "@/lib/contracts";
import { similarity } from "@/lib/engine/memory-match";
import { memoryStatus } from "@/lib/engine/memory-status";
import { memoryFacts } from "@/lib/server/agent/collections";
import { currentAccess } from "@/lib/server/request-context";
import { defineTool } from "./define";

const NO_MEMORY = "ยังไม่มีข้อมูลที่จำไว้เกี่ยวกับผู้ใช้คนนี้";
const DEFAULT_MEMORY_LIMIT = 8;
const RECALL_MIN_SIMILARITY = 0.25;

export const recallMemoryTool = defineTool({
  name: "recall_memory",
  connector: "winyu",
  tier: "read",
  roles: "all",
  description: "Search what the assistant remembers about the current user: interests, vocabulary, responsibilities, preferences. Call it when the user refers to something from an earlier session or asks what you remember.",
  input: recallMemoryInputSchema,
  execute: async ({ query }: z.infer<typeof recallMemoryInputSchema>) => {
    const access = currentAccess();
    const needle = query.toLowerCase().trim();
    const rows = memoryFacts()
      .where((fact) => fact.userId === access.userId)
      .map((fact) => ({ fact, match: needle.length === 0 || fact.value.toLowerCase().includes(needle) ? 1 : similarity(needle, fact.value) }))
      .filter(({ match }) => match >= RECALL_MIN_SIMILARITY)
      .sort((left, right) => right.match - left.match || right.fact.confidence - left.fact.confidence)
      .slice(0, DEFAULT_MEMORY_LIMIT)
      .map(({ fact }) => ({ ...fact, status: memoryStatus(fact) }));
    if (rows.length === 0) return { ok: true as const, summary: NO_MEMORY, data: [] };
    return { ok: true as const, summary: `จำได้ ${rows.length} เรื่องที่เกี่ยวข้อง`, data: rows };
  },
});
