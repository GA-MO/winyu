import { createHash } from "node:crypto";
import { ROLE_IDS, documentHeaderSchema, type CompanyDocument, type DocumentChunk, type DocumentHeader, type RoleId } from "@/lib/contracts";

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?/;
const FIELD = /^([a-z]+):\s*(.*)$/;
const HEADING = /^(#{1,3})\s+(.+)$/;
const NUMBERING = /^\d+(?:\.\d+)*\.?\s+/;
const PARAGRAPH_BREAK = /\n\s*\n/;
const SECTION_JOINER = " › ";
const HASH_CHARS = 16;

/** The longest section text kept as one chunk; a longer section is split at paragraph breaks under the same headings. */
export const MAX_CHUNK_CHARS = 1200;

type Heading = { section: string | null; subsection: string | null };

/** Why a document file could not be read, in words an admin can act on. */
export class DocumentFormatError extends Error {}

function headerOf(source: string): { header: DocumentHeader; body: string } {
  const match = FRONTMATTER.exec(source);
  if (!match) throw new DocumentFormatError("missing --- header ---");
  const fields: Record<string, unknown> = {};
  for (const line of match[1].split("\n")) {
    const field = FIELD.exec(line.trim());
    if (field) fields[field[1]] = field[2].trim();
  }
  const audience = String(fields.audience ?? "");
  fields.audience = audience === "all" ? "all" : audience.split(",").map((role) => role.trim()).filter(Boolean);
  const parsed = documentHeaderSchema.safeParse(fields);
  if (!parsed.success) throw new DocumentFormatError(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
  return { header: parsed.data, body: source.slice(match[0].length) };
}

function headingText(raw: string): string {
  return raw.trim().replace(NUMBERING, "");
}

function sectionLabel(heading: Heading): string | null {
  const parts = [heading.section, heading.subsection].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(SECTION_JOINER);
}

function pieces(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text];
  const out: string[] = [];
  let current = "";
  for (const paragraph of text.split(PARAGRAPH_BREAK).map((part) => part.trim()).filter(Boolean)) {
    if (current.length > 0 && current.length + paragraph.length + 2 > MAX_CHUNK_CHARS) {
      out.push(current);
      current = "";
    }
    current = current.length === 0 ? paragraph : `${current}\n\n${paragraph}`;
  }
  if (current.length > 0) out.push(current);
  return out;
}

function hashOf(header: DocumentHeader, readers: readonly RoleId[], section: string, text: string): string {
  return createHash("sha256").update(JSON.stringify([header.title, header.version, header.effective, header.owner, readers, section, text])).digest("hex").slice(0, HASH_CHARS);
}

/** The roles that may read a document: every role for `all`, otherwise the listed ones. */
export function readersOf(header: DocumentHeader): readonly RoleId[] {
  return header.audience === "all" ? ROLE_IDS : header.audience;
}

/** Reads one Markdown document: its header, then one chunk per `###` subsection (or `##` section without subsections), headings kept as the chunk's section, long sections split at paragraph breaks. */
export function parseDocument(source: string): CompanyDocument {
  const { header, body } = headerOf(source.replace(/\r\n/g, "\n"));
  const readers = readersOf(header);
  const sections: { section: string; text: string }[] = [];
  let heading: Heading = { section: null, subsection: null };
  let lines: string[] = [];
  const flush = () => {
    const text = lines.join("\n").trim();
    const label = sectionLabel(heading);
    lines = [];
    if (text.length === 0 || label === null) return;
    for (const piece of pieces(text)) sections.push({ section: label, text: piece });
  };
  for (const line of body.split("\n")) {
    const match = HEADING.exec(line);
    if (!match) {
      lines.push(line);
      continue;
    }
    flush();
    const level = match[1].length;
    if (level === 2) heading = { section: headingText(match[2]), subsection: null };
    if (level === 3) heading = { section: heading.section, subsection: headingText(match[2]) };
  }
  flush();
  const chunks: DocumentChunk[] = sections.map(({ section, text }, index) => ({
    id: `${header.id}#${index + 1}`,
    docId: header.id,
    title: header.title,
    section,
    text,
    readers,
    hash: hashOf(header, readers, section, text),
  }));
  return { header, readers, chunks };
}

/** The text a chunk is embedded and keyword-matched as: the document title and its section headings, then the section text. */
export function searchableText(chunk: DocumentChunk): string {
  return `${chunk.title}${SECTION_JOINER}${chunk.section}\n${chunk.text}`;
}
