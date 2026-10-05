import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CompanyDocument, DocumentChunk, RoleId } from "@/lib/contracts";
import { DocumentFormatError, parseDocument } from "./chunk";

const DOCUMENT_EXTENSION = ".md";

/** Where the company documents live: one Markdown file per document, committed with the code. */
export const DOCUMENTS_DIR = process.env.WINYU_DOCUMENTS_DIR ?? path.join(process.cwd(), "data", "documents");

/** A document file that could not be read, and why. */
export type BrokenDocument = { file: string; reason: string };

/** Every document in the folder, plus the files that failed to parse. */
export type Corpus = { documents: CompanyDocument[]; broken: BrokenDocument[]; chunks: DocumentChunk[] };

let cached: Corpus | null = null;
let override: string | null = null;

function load(dir: string): Corpus {
  const files = readdirSync(dir).filter((file) => file.endsWith(DOCUMENT_EXTENSION)).sort();
  const documents: CompanyDocument[] = [];
  const broken: BrokenDocument[] = [];
  for (const file of files) {
    try {
      const document = parseDocument(readFileSync(path.join(dir, file), "utf8"));
      if (`${document.header.id}${DOCUMENT_EXTENSION}` !== file) throw new DocumentFormatError(`id ${document.header.id} does not match the file name`);
      documents.push(document);
    } catch (error) {
      if (!(error instanceof DocumentFormatError)) throw error;
      broken.push({ file, reason: error.message });
    }
  }
  return { documents, broken, chunks: documents.flatMap((document) => document.chunks) };
}

/** The corpus as last read; read once per process and again after `reloadCorpus`. */
export function corpus(): Corpus {
  cached ??= load(override ?? DOCUMENTS_DIR);
  return cached;
}

/** Reads documents from another folder for this process (tests use a fixture folder); null restores the company folder. */
export function useDocumentsDir(dir: string | null): void {
  override = dir;
  cached = null;
}

/** Reads the folder again, for re-indexing after a document changed. */
export function reloadCorpus(): Corpus {
  cached = load(override ?? DOCUMENTS_DIR);
  return cached;
}

/** The chunks one role may read, decided before any search sees a chunk. */
export function readableChunks(role: RoleId): DocumentChunk[] {
  return corpus().chunks.filter((chunk) => chunk.readers.includes(role));
}

/** How many documents one role may read. */
export function readableDocumentCount(role: RoleId): number {
  return corpus().documents.filter((document) => document.readers.includes(role)).length;
}
