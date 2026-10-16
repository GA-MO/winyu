import type { MetricId } from "@/lib/contracts";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { METRICS } from "@/lib/semantic/metrics";

const DELTA_FORMAT = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export type MetricFormat = "number" | "currency" | "percent";

export function metricLabel(metric: MetricId): string {
  return METRICS[metric].labelTh;
}

export function metricFormat(metric: MetricId): MetricFormat {
  return METRICS[metric].format;
}

export function metricUnit(metric: MetricId): string {
  return METRICS[metric].unit;
}

export function metricSource(metric: MetricId): string {
  return METRICS[metric].sourceSystem;
}

/** A metric value as the user reads it: number with unit, บาท for money, % for ratios, `***` when masked. */
export function formatMetricValue(metric: MetricId, value: number | string | null): string {
  const format = metricFormat(metric);
  if (format === "currency") return formatCurrency(value);
  if (format === "percent") return formatPercent(value);
  const unit = metricUnit(metric);
  const formatted = formatNumber(value);
  if (!unit || formatted === "—") return formatted;
  return formatted.endsWith("ล้าน") ? `${formatted}${unit}` : `${formatted} ${unit}`;
}

const LOWER_IS_BETTER = new Set<MetricId>(["ar_overdue", "attrition_rate", "forecast_mape", "trade_spend"]);
const NEUTRAL_BAND_PCT = 2;
const NEUTRAL_BAND_POINTS = 0.1;

export type Direction = "up" | "down" | "neutral";
export type Tone = "good" | "bad" | "neutral";

/** Which way the arrow points: the raw sign of the change, never the judgement. */
export function directionOf(deltaPercent: number | null): Direction {
  if (deltaPercent === null || Math.abs(deltaPercent) < NEUTRAL_BAND_PCT) return "neutral";
  return deltaPercent > 0 ? "up" : "down";
}

/** Whether that direction is good news for this metric: overdue money going up is bad, sales going up is good. */
export function toneOf(metric: MetricId, deltaPercent: number | null): Tone {
  const direction = directionOf(deltaPercent);
  if (direction === "neutral") return "neutral";
  const rising = direction === "up";
  return rising === LOWER_IS_BETTER.has(metric) ? "bad" : "good";
}

function pointsDirectionOf(deltaPoints: number): Direction {
  if (Math.abs(deltaPoints) < NEUTRAL_BAND_POINTS) return "neutral";
  return deltaPoints > 0 ? "up" : "down";
}

/** Which way a change points as the card writes it: a percent metric moves in points and is flat under a tenth of a point, any other metric in relative percent with its ±2% band. */
export function changeDirectionOf(metric: MetricId, deltaPercent: number | null, deltaPoints: number | null): Direction {
  if (metricFormat(metric) === "percent" && deltaPoints !== null) return pointsDirectionOf(deltaPoints);
  return directionOf(deltaPercent);
}

/** Whether a change is good news, judged in the unit the card writes it in (points for a percent metric). */
export function changeToneOf(metric: MetricId, deltaPercent: number | null, deltaPoints: number | null): Tone {
  const direction = changeDirectionOf(metric, deltaPercent, deltaPoints);
  if (direction === "neutral") return "neutral";
  return (direction === "up") === LOWER_IS_BETTER.has(metric) ? "bad" : "good";
}

/** A signed change in percentage points the way a card shows it: "+0.9 จุด", "-0.6 จุด", "0 จุด". */
export function formatPoints(points: number | null): string | null {
  if (points === null) return null;
  const rounded = Math.round(points * 10) / 10;
  if (rounded === 0) return TH.dash.points("0");
  return TH.dash.points(`${rounded > 0 ? "+" : ""}${DELTA_FORMAT.format(rounded)}`);
}

/** How a card writes a change: in percentage points for a metric that is itself a percent (a margin going 24.3% to 23.7% is "-0.6 จุด", not "-2.4%"), as a relative percent otherwise. */
export function formatChange(metric: MetricId, deltaPercent: number | null, deltaPoints: number | null): string | null {
  return metricFormat(metric) === "percent" ? formatPoints(deltaPoints) : formatDelta(deltaPercent);
}

/** A signed percentage the way a card shows it: "+5.4%", "-12.0%", "0%". */
export function formatDelta(deltaPercent: number | null): string | null {
  if (deltaPercent === null) return null;
  const rounded = Math.round(deltaPercent * 10) / 10;
  if (rounded === 0) return "0%";
  return `${rounded > 0 ? "+" : ""}${DELTA_FORMAT.format(rounded)}%`;
}
