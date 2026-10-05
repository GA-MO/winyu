import type { Dim, MetricQuery, MetricRow } from "@/lib/contracts";
import { periodLabelTh } from "@/lib/i18n/format";
import { formatMetricValue, metricLabel } from "@/lib/dashboard/metric-display";

const TIME_DIMS: readonly Dim[] = ["date", "week", "month"];
const DC_PREFIX = "ศูนย์กระจายสินค้า";
const DC_SHORT = "DC ";
const PERCENT = 100;
const LABEL_SEPARATOR = " · ";

export function numericOf(row: MetricRow, key: string): number | null {
  const value = row[key];
  return typeof value === "number" ? value : null;
}

/** The row's change against the compare window, stored by the engine or derived from the two values. */
export function deltaPercentOf(row: MetricRow): number | null {
  const stored = numericOf(row, "delta_pct");
  if (stored !== null) return stored;
  const value = numericOf(row, "value");
  const previous = numericOf(row, "compare_value");
  if (value === null || previous === null || previous === 0) return null;
  return ((value - previous) / Math.abs(previous)) * PERCENT;
}

export function isTimeDim(dim: Dim): boolean {
  return TIME_DIMS.includes(dim);
}

export function timeDimOf(query: MetricQuery): Dim | null {
  return query.dims.find(isTimeDim) ?? null;
}

export function groupDimsOf(query: MetricQuery): Dim[] {
  return query.dims.filter((dim) => !isTimeDim(dim));
}

function partLabel(dim: Dim, value: string): string {
  if (isTimeDim(dim)) return periodLabelTh(value);
  if (dim === "dc") return value.replace(DC_PREFIX, DC_SHORT);
  return value;
}

/** The row's name along the given dims, e.g. "ภาคกลาง · โมเดิร์นเทรด"; null when the row has none of them. */
export function labelAlong(dims: readonly Dim[], row: MetricRow): string | null {
  const parts = dims
    .map((dim) => ({ dim, value: row[dim] }))
    .filter((part) => part.value !== null && part.value !== undefined && part.value !== "")
    .map((part) => partLabel(part.dim, String(part.value)));
  return parts.length > 0 ? parts.join(LABEL_SEPARATOR) : null;
}

export function labelOf(query: MetricQuery, row: MetricRow): string {
  return labelAlong(query.dims, row) ?? metricLabel(query.metric);
}

export function valueTextOf(query: MetricQuery, row: MetricRow): string {
  const label = row.value_label;
  if (typeof label === "string") return label;
  return formatMetricValue(query.metric, row.value as number | string | null);
}
