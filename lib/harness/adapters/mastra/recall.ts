import path from "node:path";
import type { LibSQLVector } from "@mastra/libsql";
import { z } from "zod";
import type { MetricQuery } from "@/lib/contracts";
import { currentEmbedder } from "@/lib/server/recall/embedder";
import { maskNumbers, REPLY_CHARS, truncate } from "@/lib/server/recall/mask";
import type { Embedder, RecallTurn, RecalledConversation } from "@/lib/server/recall/types";
import { DATA_DIR } from "@/lib/server/store/json-store";
import { threads } from "@/lib/server/threads-read";

const STORAGE_FILE = "mastra.db";
const VECTOR_STORE_ID = "winyu-recall";
const INDEX_NAME = "winyu_recall";
const SEARCH_TOP_K = 12;
const DEFAULT_LIMIT = 3;
const LISTING_TOP_K = 5000;
const QUESTION_SUFFIX = ":q";
const REPLY_SUFFIX = ":a";

const turnMetadataSchema = z.object({
  resource_id: z.string(),
  thread_id: z.string(),
  turn_id: z.string(),
  role: z.enum(["question", "reply"]),
  text: z.string(),
  at: z.string(),
  question: z.string(),
  reply: z.string(),
  queries: z.string(),
});

type TurnMetadata = z.infer<typeof turnMetadataSchema>;

type Role = TurnMetadata["role"];

type Hit = { score: number; metadata: TurnMetadata };

/** A conversation the person can see is findable, and take out of recall. */
export type RecallableThread = { threadId: string; title: string; turns: number; lastAt: string };

type Reembedded = { ids: string[]; vectors: number[][]; metadata: Record<string, unknown>[] };

let opened: { embedderId: string; store: Promise<LibSQLVector> } | null = null;

/** The index's rows embedded again when it was built for another vector size, or null when it fits; nothing is deleted until every text has its new vector. */
async function reembedResized(setup: LibSQLVector, url: string, embedder: Embedder): Promise<Reembedded | null> {
  if (!(await setup.listIndexes()).includes(INDEX_NAME)) return null;
  if ((await setup.describeIndex({ indexName: INDEX_NAME })).dimension === embedder.dimension) return null;
  const { storedVectors } = await import("./exact-vector-store");
  const rows = (await storedVectors({ url, indexName: INDEX_NAME })).filter((row) => turnMetadataSchema.safeParse(row.metadata).success);
  const vectors = await embedder.passages(rows.map((row) => String(row.metadata.text)));
  return { ids: rows.map((row) => row.id), vectors, metadata: rows.map((row) => row.metadata) };
}

async function openStore(embedder: Embedder): Promise<LibSQLVector> {
  const [{ LibSQLVector }, { reopenExact }] = await Promise.all([import("@mastra/libsql"), import("./exact-vector-store")]);
  const url = `file:${path.join(DATA_DIR, STORAGE_FILE)}`;
  const setup = new LibSQLVector({ id: VECTOR_STORE_ID, url });
  const carried = await reembedResized(setup, url, embedder);
  if (carried) await setup.deleteIndex({ indexName: INDEX_NAME });
  await setup.createIndex({ indexName: INDEX_NAME, dimension: embedder.dimension });
  const store = await reopenExact(setup, { id: VECTOR_STORE_ID, url, indexName: INDEX_NAME });
  if (carried && carried.ids.length > 0) await store.upsert({ indexName: INDEX_NAME, ...carried });
  return store;
}

/** The recall index for the current embedder; switching embedders reopens it, and an index of another vector size is re-embedded from its stored texts. */
function vectorStore(): Promise<LibSQLVector> {
  const embedder = currentEmbedder();
  if (opened?.embedderId === embedder.id) return opened.store;
  const store = openStore(embedder);
  opened = { embedderId: embedder.id, store };
  store.catch(() => {
    if (opened?.store === store) opened = null;
  });
  return store;
}

/** Opens the recall index, re-embedding it first when the embedder changed its vector size. */
export async function prepareRecallIndex(): Promise<{ dimension: number; vectors: number }> {
  const store = await vectorStore();
  const stats = await store.describeIndex({ indexName: INDEX_NAME });
  return { dimension: stats.dimension, vectors: stats.count };
}

function metadataOf(turn: RecallTurn, role: Role, text: string): TurnMetadata {
  return { resource_id: turn.userId, thread_id: turn.threadId, turn_id: turn.turnId, role, text, at: turn.at, question: turn.question, reply: turn.reply, queries: JSON.stringify(turn.queries) };
}

function queriesOf(json: string): MetricQuery[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as MetricQuery[]) : [];
  } catch {
    return [];
  }
}

function ownedTitle(threadId: string, userId: string): string | null {
  const thread = threads().get(threadId);
  return thread && thread.userId === userId ? thread.title : null;
}

function hitsOf(results: readonly { score: number; metadata?: Record<string, unknown> }[]): Hit[] {
  return results.flatMap((result) => {
    const parsed = turnMetadataSchema.safeParse(result.metadata);
    return parsed.success ? [{ score: result.score, metadata: parsed.data }] : [];
  });
}

function bestPerThread(hits: readonly Hit[]): Hit[] {
  const best = new Map<string, Hit>();
  for (const hit of hits) {
    const kept = best.get(hit.metadata.thread_id);
    if (!kept || hit.score > kept.score) best.set(hit.metadata.thread_id, hit);
  }
  return [...best.values()].sort((left, right) => right.score - left.score);
}

function recalled(hit: Hit, title: string): RecalledConversation {
  const { metadata } = hit;
  return {
    threadId: metadata.thread_id,
    title,
    at: metadata.at,
    question: maskNumbers(metadata.question),
    reply: truncate(maskNumbers(metadata.reply), REPLY_CHARS),
    queries: queriesOf(metadata.queries),
    score: hit.score,
  };
}

/** Makes one finished turn findable: its question and its reply each as a vector under the person's id; indexing the same turn again replaces it. */
export async function indexTurn(turn: RecallTurn): Promise<void> {
  const texts = [turn.question, turn.reply];
  const vectors = await currentEmbedder().passages(texts);
  await (await vectorStore()).upsert({
    indexName: INDEX_NAME,
    vectors,
    ids: [`${turn.turnId}${QUESTION_SUFFIX}`, `${turn.turnId}${REPLY_SUFFIX}`],
    metadata: [metadataOf(turn, "question", turn.question), metadataOf(turn, "reply", turn.reply)],
  });
}

/** The person's past conversations closest to a question, best first: one per thread, only threads that still exist and are theirs, numbers masked. */
export async function searchConversations(userId: string, query: string, options: { excludeThreadId?: string | null; limit?: number } = {}): Promise<RecalledConversation[]> {
  const queryVector = await currentEmbedder().query(query);
  const results = await (await vectorStore()).query({ indexName: INDEX_NAME, queryVector, topK: SEARCH_TOP_K, filter: { resource_id: userId } });
  return bestPerThread(hitsOf(results))
    .filter((hit) => hit.metadata.thread_id !== options.excludeThreadId)
    .flatMap((hit) => {
      const title = ownedTitle(hit.metadata.thread_id, userId);
      return title === null ? [] : [recalled(hit, title)];
    })
    .slice(0, options.limit ?? DEFAULT_LIMIT);
}

/** Takes one conversation out of recall; the thread itself stays in the chat history. */
export async function forgetConversation(userId: string, threadId: string): Promise<void> {
  await (await vectorStore()).deleteVectors({ indexName: INDEX_NAME, filter: { resource_id: userId, thread_id: threadId } });
}

/** Takes every conversation of the person out of recall. */
export async function forgetConversations(userId: string): Promise<void> {
  await (await vectorStore()).deleteVectors({ indexName: INDEX_NAME, filter: { resource_id: userId } });
}

function anyVector(dimension: number): number[] {
  return Array.from({ length: dimension }, () => 1 / Math.sqrt(dimension));
}

/** The person's conversations recall can find, newest first, with how many turns each holds. */
export async function recallableThreads(userId: string): Promise<RecallableThread[]> {
  const results = await (await vectorStore()).query({ indexName: INDEX_NAME, queryVector: anyVector(currentEmbedder().dimension), topK: LISTING_TOP_K, filter: { resource_id: userId, role: "question" } });
  const hits = hitsOf(results);
  const byThread = new Map<string, RecallableThread>();
  for (const { metadata } of hits) {
    const title = ownedTitle(metadata.thread_id, userId);
    if (title === null) continue;
    const kept = byThread.get(metadata.thread_id) ?? { threadId: metadata.thread_id, title, turns: 0, lastAt: metadata.at };
    byThread.set(metadata.thread_id, { ...kept, turns: kept.turns + 1, lastAt: metadata.at > kept.lastAt ? metadata.at : kept.lastAt });
  }
  return [...byThread.values()].sort((left, right) => right.lastAt.localeCompare(left.lastAt));
}
