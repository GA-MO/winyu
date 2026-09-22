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
  return unit && formatted !== "—" ? `${formatted} ${unit}` : formatted;
}
