import type { DocumentChunk, DocumentHeader, RoleId } from "@/lib/contracts";
import { indexedChunks, syncDocumentIndex, type IndexReport } from "@/lib/harness/adapters/mastra/documents-index";
import { corpus, reloadCorpus, type BrokenDocument } from "./corpus";

/** Whether a document's chunks in the index match the file: all current, some missing or changed, or none indexed yet. */
export type IndexState = "current" | "stale" | "missing";

/** One document as the admin sees it: its header, who may read it, how many sections the file has and how many the index holds as they are now. */
export type DocumentStatus = { header: DocumentHeader; readers: readonly RoleId[]; sections: number; indexed: number; state: IndexState; indexedAt: string | null };

/** The corpus against the index: each document's state, files that failed to parse, and documents the index still holds after their file was removed. */
export type CorpusStatus = { documents: DocumentStatus[]; broken: BrokenDocument[]; orphaned: string[]; chunks: number; indexedChunks: number };

/** Re-reads the documents folder and brings the vector index to match it; safe to run any number of times. */
export async function indexDocuments(): Promise<IndexReport & { broken: BrokenDocument[] }> {
  const fresh = reloadCorpus();
  const headers = new Map(fresh.documents.map((document) => [document.header.id, document.header]));
  const factsOf = (chunk: DocumentChunk) => {
    const header = headers.get(chunk.docId);
    return { version: header?.version ?? "", effective: header?.effective ?? "", owner: header?.owner ?? "" };
  };
  return { ...(await syncDocumentIndex(fresh.chunks, factsOf)), broken: fresh.broken };
}

function stateOf(sections: number, current: number, held: number): IndexState {
  if (held === 0) return "missing";
  return current === sections && held === sections ? "current" : "stale";
}

/** Each document's index state, for the admin. */
export async function corpusStatus(): Promise<CorpusStatus> {
  const { documents, broken, chunks } = corpus();
  const indexed = await indexedChunks();
  const fileIds = new Set(documents.map((document) => document.header.id));
  const documentStatuses = documents.map((document): DocumentStatus => {
    const held = indexed.filter((entry) => entry.doc_id === document.header.id);
    const hashes = new Map(held.map((entry) => [entry.id, entry.hash]));
    const current = document.chunks.filter((chunk) => hashes.get(chunk.id) === chunk.hash).length;
    const indexedAt = held.map((entry) => entry.indexed_at).sort().at(-1) ?? null;
    return { header: document.header, readers: document.readers, sections: document.chunks.length, indexed: current, state: stateOf(document.chunks.length, current, held.length), indexedAt };
  });
  const orphaned = [...new Set(indexed.map((entry) => entry.doc_id).filter((id) => !fileIds.has(id)))];
  return { documents: documentStatuses, broken, orphaned, chunks: chunks.length, indexedChunks: indexed.length };
}

let ensured: Promise<unknown> | null = null;

/** Brings the index up to the documents folder once per process before the first search, so a fresh data folder or an edited document is searchable without a manual re-index. */
export function ensureDocumentIndex(): Promise<unknown> {
  ensured ??= indexDocuments().catch((error: unknown) => {
    ensured = null;
    console.error("document index failed", error);
  });
  return ensured;
}
