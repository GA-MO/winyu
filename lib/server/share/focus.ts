import type { MetricResult, User } from "@/lib/contracts";
import { rowsNamedIn } from "@/lib/cards/asked";
import { attainmentOf } from "@/lib/cards/breakdown";
import { monthElapsedOf } from "@/lib/cards/present";
import { percentText } from "@/lib/cards/reading";
import { groupDimsOf, labelAlong } from "@/lib/cards/rows";
import { TH } from "@/lib/i18n/th";
import type { CardFocus, SharedCard } from "@/lib/share/card";
import { rowContradictionOf, type RowFigure } from "@/lib/share/figures";
import { alertFocusIn, cardAlerts } from "./alert-card";
import { askedFigure, askedHero, cardAnswers } from "./goal";

const PERCENT = 100;

type MetricAnswer = Extract<MetricResult, { ok: true }>;

/** A row of a month still running against its target as its card row prints it: its share of the whole month's target and where the month should be by today; null on any other card. */
function printedOnMonthBase(answer: MetricAnswer, row: MetricAnswer["rows"][number]): string | undefined {
  const paced = answer.headline.projection ? attainmentOf(row) : null;
  if (paced === null) return undefined;
  const elapsed = monthElapsedOf(answer.query, answer.provenance.asOf);
  return `${percentText(paced * elapsed)} ${TH.read.ofMonthTarget} (${TH.read.paceMark(percentText(elapsed * PERCENT))})`;
}

function rowFigureOf(answer: MetricAnswer, labels: readonly string[]): RowFigure | null {
  if (labels.length !== 1) return null;
  const dims = groupDimsOf(answer.query);
  const row = answer.rows.find((candidate) => labelAlong(dims, candidate) === labels[0]);
  const change = row?.delta_pct;
  if (!row || typeof change !== "number") return null;
  const printed = printedOnMonthBase(answer, row);
  return { label: labels[0], change, versus: answer.headline.compareLabel ?? "", ...(printed ? { printed } : {}) };
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

/** What a send is about beyond the card's own filters: the rows the first of `words` that names any (the ask, then what the person typed, newest first) singles out, in the first of the card's metric reads that shows them (a paired card draws the region total and its agents), else among the places its anomaly reads list (AI-291), read again under the sender's access, with what any of those words claim about the one row; null when none names a row. No model call. */
export async function cardFocus(card: SharedCard, viewer: User, words: readonly (string | null | undefined)[]): Promise<CardFocus | null> {
  const texts = words.filter((text): text is string => Boolean(text?.trim()));
  const answers = (await cardAnswers(card, viewer)).filter((answer): answer is MetricAnswer => answer.ok);
  const metricFocus = answers.map((answer) => focusIn(answer, texts)).find((focus) => focus !== null);
  return metricFocus ?? alertFocusIn(await cardAlerts(card, viewer), texts);
}
