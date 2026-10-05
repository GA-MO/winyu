import type { DocumentChunk, RoleId } from "@/lib/contracts";
import { documentVectorSearch } from "@/lib/harness/adapters/mastra/documents-index";
import { searchableText } from "./chunk";
import { readableChunks } from "./corpus";
import { keywordSearch } from "./keyword";

const CANDIDATES = 12;
const RRF_K = 60;

/** How passages are ranked: by vector similarity, by keyword (BM25), or both fused by reciprocal rank. */
export type RetrievalMode = "vector" | "keyword" | "hybrid";

/** The mode `search_documents` uses, chosen by `bun run docs:bench`: vector alone found the answering section in the top 3 for 44 of 45 questions, hybrid for 42 and keyword for 39. */
export const RETRIEVAL_MODE: RetrievalMode = "vector";

/** How many passages `search_documents` returns. */
export const PASSAGE_LIMIT = 4;

/** A chunk found for a question, with the score it ranked by. */
export type FoundChunk = { chunk: DocumentChunk; score: number };

function fused(rankings: readonly (readonly { id: string }[])[]): { id: string; score: number }[] {
  const scores = new Map<string, number>();
  for (const ranking of rankings) ranking.forEach((hit, rank) => scores.set(hit.id, (scores.get(hit.id) ?? 0) + 1 / (RRF_K + rank + 1)));
  return [...scores].map(([id, score]) => ({ id, score })).sort((left, right) => right.score - left.score);
}

async function vectorHits(role: RoleId, query: string): Promise<{ id: string; score: number }[] | null> {
  try {
    return await documentVectorSearch(role, query, CANDIDATES);
  } catch (error) {
    console.error("document vector search failed, keyword ranking only", error);
    return null;
  }
}

async function ranked(role: RoleId, readable: readonly DocumentChunk[], query: string, mode: RetrievalMode): Promise<{ id: string; score: number }[]> {
  const keyword = () => keywordSearch(readable.map((chunk) => ({ id: chunk.id, text: searchableText(chunk) })), query, CANDIDATES);
  if (mode === "keyword") return keyword();
  const vector = await vectorHits(role, query);
  if (vector === null) return keyword();
  if (mode === "vector") return vector;
  return fused([vector, keyword()]);
}

/** The passages one role may read that best answer a question. The role decides the searchable chunks first: the keyword search sees only those, the vector query carries the role as a condition, and a hit outside them is dropped. */
export async function searchDocuments(role: RoleId, query: string, options: { limit?: number; mode?: RetrievalMode } = {}): Promise<FoundChunk[]> {
  const readable = readableChunks(role);
  const byId = new Map(readable.map((chunk) => [chunk.id, chunk]));
  const hits = await ranked(role, readable, query, options.mode ?? RETRIEVAL_MODE);
  return hits.flatMap((hit) => {
    const chunk = byId.get(hit.id);
    return chunk ? [{ chunk, score: hit.score }] : [];
  }).slice(0, options.limit ?? PASSAGE_LIMIT);
}
