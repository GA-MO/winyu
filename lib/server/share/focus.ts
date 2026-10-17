import type { MetricResult, User } from "@/lib/contracts";
import { rowsNamedIn } from "@/lib/cards/asked";
import { groupDimsOf, labelAlong } from "@/lib/cards/rows";
import type { CardFocus, SharedCard } from "@/lib/share/card";
import { rowContradictionOf, type RowFigure } from "@/lib/share/figures";
import { askedFigure, askedHero, cardAnswers } from "./goal";

type MetricAnswer = Extract<MetricResult, { ok: true }>;

function rowFigureOf(answer: MetricAnswer, labels: readonly string[]): RowFigure | null {
  if (labels.length !== 1) return null;
  const dims = groupDimsOf(answer.query);
  const change = answer.rows.find((candidate) => labelAlong(dims, candidate) === labels[0])?.delta_pct;
  return typeof change === "number" ? { label: labels[0], change, versus: answer.headline.compareLabel ?? "" } : null;
}

function claimAbout(texts: readonly string[], answer: MetricAnswer, row: RowFigure | null): string | null {
  if (!row) return null;
  const naming = texts.filter((text) => rowsNamedIn(text, answer.query, answer.rows).includes(row.label));
  return naming.map((text) => rowContradictionOf(text, row)).find((claim) => claim !== null) ?? null;
}

function focusIn(answer: MetricAnswer, texts: readonly string[]): CardFocus | null {
  const labels = texts.map((text) => rowsNamedIn(text, answer.query, answer.rows)).find((named) => named.length > 0);
  if (!labels) return null;
  const row = rowFigureOf(answer, labels);
  return { labels, hero: askedHero(answer, labels), figure: askedFigure(answer, labels), row, claim: claimAbout(texts, answer, row) };
}

/** What a send is about beyond the card's own filters: the rows the first of `words` that names any (the ask, then what the person typed, newest first) singles out, in the first of the card's metric reads that shows them (a paired card draws the region total and its agents), read again under the sender's access, with what any of those words claim about the one row; null when none names a row. No model call. */
export async function cardFocus(card: SharedCard, viewer: User, words: readonly (string | null | undefined)[]): Promise<CardFocus | null> {
  const texts = words.filter((text): text is string => Boolean(text?.trim()));
  const answers = (await cardAnswers(card, viewer)).filter((answer): answer is MetricAnswer => answer.ok);
  return answers.map((answer) => focusIn(answer, texts)).find((focus) => focus !== null) ?? null;
}
