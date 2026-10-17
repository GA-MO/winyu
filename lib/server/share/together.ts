import type { CardHero } from "@/lib/cards/present";
import { monthElapsedOf } from "@/lib/cards/present";
import { percentText } from "@/lib/cards/reading";
import { groupDimsOf, labelAlong, numericOf, timeDimOf } from "@/lib/cards/rows";
import type { MetricResult } from "@/lib/contracts";
import { directionOf, formatDelta, formatMetricValue, toneOf } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";
import { withMinusSign } from "@/lib/share/figures";

const PERCENT = 100;
const NAME_SEPARATOR = ", ";

type MetricAnswer = Extract<MetricResult, { ok: true }>;

function sumOf(values: readonly (number | null)[]): number | null {
  return values.some((value) => value === null) ? null : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

/** Whether a card's rows are read on the whole month's target: a month still running, rows against target, no time axis (AI-235). */
function onMonthBase(answer: MetricAnswer): boolean {
  const { query, headline } = answer;
  return query.compare === "target" && query.metric !== "target_attainment" && timeDimOf(query) === null && Boolean(headline.projection);
}

/** Rows of one card a send singles out read together, on the base the card reads one such row (AI-303): their sum against their summed target while the month runs as a share of the whole month's target with where the month should be by today, else against their summed target, else their sum with its change; null when the card's rows do not add up (an average) or a row lacks its comparison. */
export function togetherFigure(answer: MetricAnswer, labels: readonly string[]): CardHero | null {
  if (answer.headline.aggregate !== "sum") return null;
  const dims = groupDimsOf(answer.query);
  const rows = answer.rows.filter((row) => labels.includes(labelAlong(dims, row) ?? ""));
  const value = sumOf(rows.map((row) => numericOf(row, "value")));
  const base = sumOf(rows.map((row) => numericOf(row, "compare_value")));
  if (rows.length < 2 || value === null || base === null || base <= 0) return null;
  const change = (value / base - 1) * PERCENT;
  const label = TH.read.rowsTogether(rows.map((row) => labelAlong(dims, row) ?? "").join(NAME_SEPARATOR));
  if (onMonthBase(answer)) {
    const elapsed = monthElapsedOf(answer.query, answer.provenance.asOf);
    const share = (PERCENT + change) * elapsed;
    const behind = share < PERCENT * elapsed;
    return { label, value: percentText(share), unit: TH.read.ofMonthTarget, delta: null, trend: behind ? "down" : "neutral", tone: behind ? "bad" : "neutral", detail: TH.read.paceMark(percentText(elapsed * PERCENT)) };
  }
  if (answer.query.compare === "target") {
    const behind = change < 0;
    return { label, value: percentText(PERCENT + change), unit: TH.read.ofTarget, delta: null, trend: behind ? "down" : "neutral", tone: behind ? "bad" : "neutral", detail: formatMetricValue(answer.query.metric, value) };
  }
  const delta = formatDelta(change);
  return { label, value: formatMetricValue(answer.query.metric, value), unit: null, delta: delta ? withMinusSign(delta) : null, trend: directionOf(change), tone: toneOf(answer.query.metric, change), detail: answer.headline.compareLabel ?? null };
}
