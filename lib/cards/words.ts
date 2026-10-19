import type { CardBody, CardParts } from "./present";

const SEGMENTER = new Intl.Segmenter("th", { granularity: "word" });

function bodyTexts(body: CardBody): string[] {
  if (body.kind === "strip") {
    const overall = body.strip.overall;
    return overall ? [overall.label, overall.sub ?? "", overall.second ?? "", body.strip.total ?? "", overall.text, overall.change ?? ""] : [];
  }
  if (body.kind === "exceptions") return [body.fold?.line ?? ""];
  if (body.kind === "share") return [body.centerValue];
  return [];
}

/** Every piece of text a data card shows at rest, its rows (names and the values beside them) left out like a table's cells: title, verdict, hero, tiles, the overall row, a folded line, the primary action and the footer line. */
export function cardTexts(parts: CardParts): string[] {
  const hero = parts.hero;
  return [
    parts.title,
    parts.verdict ?? "",
    ...(hero && parts.style !== "picture" ? [hero.label, hero.value, hero.unit ?? "", hero.delta ?? "", parts.style === "scorecard" ? "" : (hero.detail ?? "")] : []),
    ...parts.tiles.flatMap((tile) => [tile.label, tile.value, tile.delta ?? "", tile.sub ?? ""]),
    ...bodyTexts(parts.body),
    parts.primary?.label ?? "",
    parts.footer?.line ?? "",
  ].filter((text) => text !== "");
}

/** How many words a reader meets on a card at rest, counted the way Thai is read (a word segmenter, numbers count as words), its rows left out. */
export function cardWords(parts: CardParts): number {
  return cardTexts(parts).reduce((sum, text) => sum + [...SEGMENTER.segment(text)].filter((segment) => segment.isWordLike).length, 0);
}
