import type { MetricId } from "@/lib/contracts";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/i18n/format";
import { METRICS } from "@/lib/semantic/metrics";

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

export function isCertified(metric: MetricId): boolean {
  return METRICS[metric].certified;
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

/** A signed percentage the way a card shows it: "+5.4%", "-12.0%", "0%". */
export function formatDelta(deltaPercent: number | null): string | null {
  if (deltaPercent === null) return null;
  const rounded = Math.round(deltaPercent * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${formatPercent(rounded)}`;
}
