import type { Dim, Forecast, MetricId } from "@/lib/contracts";

/** Metrics whose forecasts add up across brand and region. */
export const ADDITIVE_FORECAST_METRICS: ReadonlySet<MetricId> = new Set<MetricId>(["net_sales_volume"]);

export type ForecastSlice =
  | { ok: true; points: Forecast["points"]; mape: number; seriesCount: number }
  | { ok: false; missingDims: Dim[] };

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function pinnedDims(dims: Partial<Record<Dim, string>>): [Dim, string][] {
  return (Object.entries(dims) as [Dim, string | undefined][]).filter((entry): entry is [Dim, string] => Boolean(entry[1]));
}

function sumPoints(series: Forecast[]): Forecast["points"] {
  return series[0].points.map((point, index) => ({
    date: point.date,
    value: round1(series.reduce((total, entry) => total + (entry.points[index]?.value ?? 0), 0)),
    lo: round1(series.reduce((total, entry) => total + (entry.points[index]?.lo ?? 0), 0)),
    hi: round1(series.reduce((total, entry) => total + (entry.points[index]?.hi ?? 0), 0)),
  }));
}

function weightedMape(series: Forecast[]): number {
  const weights = series.map((entry) => entry.points.reduce((total, point) => total + point.value, 0));
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  if (totalWeight === 0) return series[0].mape;
  return round1(series.reduce((total, entry, index) => total + entry.mape * weights[index], 0) / totalWeight);
}

/** The forecast for exactly the slice asked: additive metrics sum every series under the pinned dims; the rest need every dim pinned. */
export function forecastSlice(forecasts: readonly Forecast[], metric: MetricId, dims: Partial<Record<Dim, string>>): ForecastSlice | null {
  const pinned = pinnedDims(dims);
  const series = forecasts.filter((entry) => entry.metric === metric && pinned.every(([dim, value]) => entry.dims[dim] === value));
  if (series.length === 0) return null;
  if (series.length === 1) return { ok: true, points: series[0].points, mape: series[0].mape, seriesCount: 1 };
  if (!ADDITIVE_FORECAST_METRICS.has(metric)) {
    const pinnedSet = new Set(pinned.map(([dim]) => dim));
    return { ok: false, missingDims: (Object.keys(series[0].dims) as Dim[]).filter((dim) => !pinnedSet.has(dim)) };
  }
  return { ok: true, points: sumPoints(series), mape: weightedMape(series), seriesCount: series.length };
}
