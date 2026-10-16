import type { MetricResult, User } from "@/lib/contracts";
import { rowsNamedIn } from "@/lib/cards/asked";
import { presentCard } from "@/lib/cards/present";
import { groupDimsOf, labelAlong } from "@/lib/cards/rows";
import type { SharedCard } from "@/lib/share/card";
import { rowContradictionOf } from "@/lib/share/figures";
import { cardAnswer } from "./goal";

type MetricAnswer = Extract<MetricResult, { ok: true }>;

/** The rows of a card the person singled out by name ("ขอนแก่นมหาชัย" on the region's agents card): their labels, the figure the card draws for them, and the line code writes when the words that named one row claim what that row does not show. */
export type CardFocus = { labels: string[]; hero: string | null; claim: string | null };

function heroOf(answer: MetricAnswer, labels: readonly string[]): string | null {
  const parts = presentCard({ title: "", query: answer.query, result: { ...answer, headline: { ...answer.headline, asked: [...labels] } } });
  const hero = parts.hero;
  return hero ? [hero.label, hero.value, hero.unit, hero.delta, hero.detail].filter(Boolean).join(" ") : null;
}

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

/** What a send is about beyond the card's own filters: the rows of the card the first of `words` that names any (the ask, then what the person typed, newest first) singles out, read again under the sender's access, with what any of those words claim about the one row; null when none names a row. No model call. */
export async function cardFocus(card: SharedCard, viewer: User, words: readonly (string | null | undefined)[]): Promise<CardFocus | null> {
  const answer = await cardAnswer(card, viewer);
  if (!answer?.ok) return null;
  const texts = words.filter((text): text is string => Boolean(text?.trim()));
  const labels = texts.map((text) => rowsNamedIn(text, answer.query, answer.rows)).find((named) => named.length > 0);
  return labels ? { labels, hero: heroOf(answer, labels), claim: claimAbout(texts, answer, labels) } : null;
}
