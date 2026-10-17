import type { MetricResult, User } from "@/lib/contracts";
import { rowsNamedIn } from "@/lib/cards/asked";
import { groupDimsOf, labelAlong } from "@/lib/cards/rows";
import type { CardFocus, SharedCard } from "@/lib/share/card";
import { rowContradictionOf } from "@/lib/share/figures";
import { askedHero, cardAnswers } from "./goal";

type MetricAnswer = Extract<MetricResult, { ok: true }>;

function claimOf(text: string, answer: MetricAnswer, label: string): string | null {
  const dims = groupDimsOf(answer.query);
  const row = answer.rows.find((candidate) => labelAlong(dims, candidate) === label);
  const change = row?.delta_pct;
  if (typeof change !== "number") return null;
  return rowContradictionOf(text, { label, change, versus: answer.headline.compareLabel ?? "" });
}

function claimAbout(texts: readonly string[], answer: MetricAnswer, labels: readonly string[]): string | null {
  if (labels.length !== 1) return null;
  const naming = texts.filter((text) => rowsNamedIn(text, answer.query, answer.rows).includes(labels[0]));
  return naming.map((text) => claimOf(text, answer, labels[0])).find((claim) => claim !== null) ?? null;
}

function focusIn(answer: MetricAnswer, texts: readonly string[]): CardFocus | null {
  const labels = texts.map((text) => rowsNamedIn(text, answer.query, answer.rows)).find((named) => named.length > 0);
  return labels ? { labels, hero: askedHero(answer, labels), claim: claimAbout(texts, answer, labels) } : null;
}

/** What a send is about beyond the card's own filters: the rows the first of `words` that names any (the ask, then what the person typed, newest first) singles out, in the first of the card's metric reads that shows them (a paired card draws the region total and its agents), read again under the sender's access, with what any of those words claim about the one row; null when none names a row. No model call. */
export async function cardFocus(card: SharedCard, viewer: User, words: readonly (string | null | undefined)[]): Promise<CardFocus | null> {
  const texts = words.filter((text): text is string => Boolean(text?.trim()));
  const answers = (await cardAnswers(card, viewer)).filter((answer): answer is MetricAnswer => answer.ok);
  return answers.map((answer) => focusIn(answer, texts)).find((focus) => focus !== null) ?? null;
}
