import type { z } from "zod";
import { searchDocumentsInputSchema, type DocumentHeader, type DocumentPassage } from "@/lib/contracts";
import { fence } from "@/lib/harness/fence";
import { formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { corpus, readableDocumentCount } from "@/lib/server/documents/corpus";
import { ensureDocumentIndex } from "@/lib/server/documents/index-documents";
import { searchDocuments, type FoundChunk } from "@/lib/server/documents/search";
import { currentAccess } from "@/lib/server/request-context";
import { defineTool } from "./define";

function passageOf({ chunk }: FoundChunk, header: DocumentHeader): DocumentPassage {
  return {
    doc_id: chunk.docId,
    title: chunk.title,
    section: chunk.section,
    version: header.version,
    effective: formatDateTh(header.effective),
    owner: header.owner,
    text: fence(chunk.text),
  };
}

export const searchDocumentsTool = defineTool({
  name: "search_documents",
  connector: "documents",
  tier: "read",
  roles: "all",
  description: "Search the company's documents (employee handbook, sales policy and credit terms, alcohol-law compliance, safety manual, expenses, data security, HR rules) for the passages that answer a question about a rule, a procedure or a limit. Returns at most 4 passages the user's role may read, each with its document title, section, version, effective date and text. Answer only from these passages and name the document and section you used. Query: the question's topic in Thai words, e.g. \"เครดิตเทอมเอเย่นต์เกรด B\".",
  input: searchDocumentsInputSchema,
  redact: ["query"],
  execute: async ({ query }: z.infer<typeof searchDocumentsInputSchema>) => {
    const { role } = currentAccess();
    await ensureDocumentIndex();
    const headers = new Map(corpus().documents.map((document) => [document.header.id, document.header]));
    const found = await searchDocuments(role, query);
    const passages = found.flatMap((hit) => {
      const header = headers.get(hit.chunk.docId);
      return header ? [passageOf(hit, header)] : [];
    });
    const readable = readableDocumentCount(role);
    return { ok: true as const, summary: passages.length === 0 ? TH.documents.none(readable) : TH.documents.summary(passages.length, readable), data: { passages } };
  },
});
