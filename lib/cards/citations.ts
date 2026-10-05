const SECTION_SEPARATOR = " › ";
const NOT_FOUND = "ไม่พบ";
const TITLE_ONLY = 2;

/** The part of a document passage a reply can cite it by. */
export type CitablePassage = { title: string; section: string };

type Citation = { name: string; precision: 0 | 1 | 2 };

function citationOf(passage: CitablePassage, reply: string): Citation | null {
  const sections = passage.section.split(SECTION_SEPARATOR);
  const own = sections[sections.length - 1];
  if (reply.includes(own)) return { name: own, precision: 0 };
  const above = sections.slice(0, -1).reverse().find((section) => reply.includes(section));
  if (above) return { name: above, precision: 1 };
  return reply.includes(passage.title) ? { name: passage.title, precision: 2 } : null;
}

/** The document or section name by which the reply cites this passage, most specific first; null when the reply names none of them. */
export function citedName(passage: CitablePassage, reply: string): string | null {
  return citationOf(passage, reply)?.name ?? null;
}

/** Splits passages into those the reply cites and those it only searched: when the reply names a passage's own section, only such passages count as cited; otherwise the most precise name it used decides. A not-found reply that names only a document ("ไม่พบในคู่มือพนักงาน") says where it looked, so it cites nothing. Order is kept within each side. */
export function splitByCitation<P extends CitablePassage>(passages: readonly P[], reply: string): { cited: P[]; searched: P[] } {
  const precisions = passages.map((passage) => citationOf(passage, reply)?.precision ?? null);
  const named = precisions.filter((precision) => precision !== null);
  if (named.length === 0) return { cited: [], searched: [...passages] };
  const best = Math.min(...named);
  if (best === TITLE_ONLY && reply.includes(NOT_FOUND)) return { cited: [], searched: [...passages] };
  return {
    cited: passages.filter((_, index) => precisions[index] === best),
    searched: passages.filter((_, index) => precisions[index] !== best),
  };
}
