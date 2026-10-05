import path from "node:path";
import { LibSQLVector } from "@mastra/libsql";
import { z } from "zod";
import { ROLE_IDS, type DocumentChunk, type RoleId } from "@/lib/contracts";
import { searchableText } from "@/lib/server/documents/chunk";
import { currentEmbedder } from "@/lib/server/recall/embedder";
import { DATA_DIR } from "@/lib/server/store/json-store";
import { reopenExact } from "./exact-vector-store";

const STORAGE_FILE = "mastra.db";
const VECTOR_STORE_ID = "winyu-documents";
const INDEX_NAME = "winyu_documents";
const EMBED_BATCH = 16;
const LISTING_TOP_K = 5000;

const chunkMetadataSchema = z.object({
  doc_id: z.string(),
  title: z.string(),
  section: z.string(),
  readers: z.array(z.enum(ROLE_IDS)),
  version: z.string(),
  effective: z.string(),
  owner: z.string(),
  hash: z.string(),
  embedder: z.string(),
  indexed_at: z.string(),
});

/** One chunk as the index holds it: its id and what it was indexed from. */
export type IndexedChunk = z.infer<typeof chunkMetadataSchema> & { id: string };

/** A chunk the vector search found for one reader, with its cosine score. */
export type VectorHit = { id: string; score: number };

/** What one index run did: chunks embedded (new or changed), removed (gone from the corpus), and left as they were. */
export type IndexReport = { embedded: number; removed: number; unchanged: number; total: number; embedder: string };

/** The facts about each chunk the index stores beside its vector. */
export type ChunkFacts = { version: string; effective: string; owner: string };

let ready: Promise<LibSQLVector> | null = null;

async function openStore(): Promise<LibSQLVector> {
  const url = `file:${path.join(DATA_DIR, STORAGE_FILE)}`;
  const setup = new LibSQLVector({ id: VECTOR_STORE_ID, url });
  const dimension = currentEmbedder().dimension;
  const existing = await setup.listIndexes();
  if (existing.includes(INDEX_NAME) && (await setup.describeIndex({ indexName: INDEX_NAME })).dimension !== dimension) await setup.deleteIndex({ indexName: INDEX_NAME });
  await setup.createIndex({ indexName: INDEX_NAME, dimension });
  return reopenExact(setup, { id: VECTOR_STORE_ID, url, indexName: INDEX_NAME });
}

function vectorStore(): Promise<LibSQLVector> {
  ready ??= openStore();
  return ready;
}

function anyVector(dimension: number): number[] {
  return Array.from({ length: dimension }, () => 1 / Math.sqrt(dimension));
}

function parsed(results: readonly { id: string; metadata?: Record<string, unknown> }[]): IndexedChunk[] {
  return results.flatMap((result) => {
    const metadata = chunkMetadataSchema.safeParse(result.metadata);
    return metadata.success ? [{ ...metadata.data, id: result.id }] : [];
  });
}

/** Every chunk in the index with what it was indexed from, for the admin and for re-indexing. */
export async function indexedChunks(): Promise<IndexedChunk[]> {
  const store = await vectorStore();
  return parsed(await store.query({ indexName: INDEX_NAME, queryVector: anyVector(currentEmbedder().dimension), topK: LISTING_TOP_K }));
}

/** Brings the index to exactly the given chunks: embeds the new and changed ones, removes the ones no longer in the corpus, leaves the rest; running it twice changes nothing the second time. */
export async function syncDocumentIndex(chunks: readonly DocumentChunk[], factsOf: (chunk: DocumentChunk) => ChunkFacts): Promise<IndexReport> {
  const embedder = currentEmbedder();
  const store = await vectorStore();
  const existing = new Map((await indexedChunks()).map((chunk) => [chunk.id, chunk]));
  const wanted = new Set(chunks.map((chunk) => chunk.id));
  const changed = chunks.filter((chunk) => {
    const indexed = existing.get(chunk.id);
    return !indexed || indexed.hash !== chunk.hash || indexed.embedder !== embedder.id;
  });
  const indexedAt = new Date().toISOString();
  for (let start = 0; start < changed.length; start += EMBED_BATCH) {
    const batch = changed.slice(start, start + EMBED_BATCH);
    const vectors = await embedder.passages(batch.map(searchableText));
    await store.upsert({
      indexName: INDEX_NAME,
      vectors,
      ids: batch.map((chunk) => chunk.id),
      metadata: batch.map((chunk) => ({ doc_id: chunk.docId, title: chunk.title, section: chunk.section, readers: [...chunk.readers], ...factsOf(chunk), hash: chunk.hash, embedder: embedder.id, indexed_at: indexedAt })),
    });
  }
  const removed = [...existing.keys()].filter((id) => !wanted.has(id));
  if (removed.length > 0) await store.deleteVectors({ indexName: INDEX_NAME, ids: removed });
  return { embedded: changed.length, removed: removed.length, unchanged: chunks.length - changed.length, total: chunks.length, embedder: embedder.id };
}

/** The chunks closest to a question among those one role may read: the role is a condition of the vector query itself, so a chunk the role may not read is never a candidate. */
export async function documentVectorSearch(role: RoleId, query: string, topK: number): Promise<VectorHit[]> {
  const queryVector = await currentEmbedder().query(query);
  const results = await (await vectorStore()).query({ indexName: INDEX_NAME, queryVector, topK, filter: { readers: { $in: [role] } } });
  return results.map((result) => ({ id: result.id, score: result.score }));
}
