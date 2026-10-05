import { z } from "zod";
import { ROLE_IDS, type RoleId } from "./identity";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DOCUMENT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The header every company document opens with: what it is, which version, who owns it, which roles may read it, and from when it applies. */
export const documentHeaderSchema = z.object({
  id: z.string().regex(DOCUMENT_ID),
  title: z.string().min(1),
  version: z.string().min(1),
  owner: z.string().min(1),
  audience: z.union([z.literal("all"), z.array(z.enum(ROLE_IDS)).min(1)]),
  effective: z.string().regex(ISO_DATE),
});

export type DocumentHeader = z.infer<typeof documentHeaderSchema>;

/** One section of a company document as it is searched: its headings kept with its text, and the roles that may read it. */
export type DocumentChunk = {
  id: string;
  docId: string;
  title: string;
  section: string;
  text: string;
  readers: readonly RoleId[];
  hash: string;
};

/** A company document with its sections, as read from the corpus folder. */
export type CompanyDocument = { header: DocumentHeader; readers: readonly RoleId[]; chunks: DocumentChunk[] };

/** One passage `search_documents` returns: where it comes from (document, section, version, effective date, owner) and its text, fenced as data. */
export type DocumentPassage = { doc_id: string; title: string; section: string; version: string; effective: string; owner: string; text: string };

export const searchDocumentsInputSchema = z.object({ query: z.string().min(1) });
