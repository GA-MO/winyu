import type { AccessContext, Dim, MetricQuery, MetricResult, MonthEndProjection } from "@/lib/contracts";
import { isTimeDim } from "@/lib/cards/rows";
import { MONTH_OF_DAY, DATA_AS_OF, addDays, daysInMonthIndex, toDayIndex } from "@/lib/data/dates";
import { projectMonthEnd } from "@/lib/engine/gap";
import { TH } from "@/lib/i18n/th";
import { comparisonRequestOf, finishMetric, formatForSummary, formatGapForSummary, keyRows, planMetric, seriesRequest, type SeriesQuery } from "@/lib/semantic/engine";
import { metricDef } from "@/lib/semantic/metrics";
import { loadDictionary } from "@/lib/server/master-data";
import { ports } from "@/lib/server/ports";
import { unlessPortDown } from "@/lib/server/ports/unavailable";

const RECENT_DAYS = 7;
const MONTH_DIM: Dim = "month";

async function readPlain(query: MetricQuery, access: AccessContext): Promise<MetricResult> {
  const plan = planMetric(query, access, await loadDictionary());
  if ("ok" in plan) return plan;
  const comparison = comparisonRequestOf(plan);
  const [current, previous] = await ports().metrics.readFacts(comparison ? [plan.current, comparison] : [plan.current]);
  return finishMetric(plan, current, previous ?? null);
}

function runPlain(query: MetricQuery, access: AccessContext): Promise<MetricResult> {
  return unlessPortDown(() => readPlain(query, access));
}

function monthStartOf(iso: string): string {
  return `${iso.slice(0, 8)}01`;
}

/** A target question over the running month from its first day, whole or split by groups or by month (one bucket, the month itself), never a daily or weekly trend; the data stops at the last day it holds even when the range reaches the month's end. */
function isMonthToDateVsTarget(query: MetricQuery): boolean {
  const splitWithinMonth = query.dims.some((dim) => isTimeDim(dim) && dim !== MONTH_DIM);
  return query.compare === "target" && query.range.from === monthStartOf(DATA_AS_OF) && query.range.to >= DATA_AS_OF && !splitWithinMonth;
}

function totalOf(query: MetricQuery, overrides: Partial<MetricQuery>): MetricQuery {
  return { ...query, dims: [], limit: null, sort: null, where: null, ...overrides };
}

/** Where a month-to-date total against target ends if the days left sell at the last seven days' pace, against the target spread evenly over the month; null for any other question. What is left is the unrounded target less the unrounded actual, printed once at the target's scale. */
export async function monthEndProjection(query: MetricQuery, access: AccessContext): Promise<MonthEndProjection | null> {
  const def = metricDef(query.metric);
  if (!def || !isMonthToDateVsTarget(query)) return null;
  const total = await runPlain(totalOf(query, {}), access);
  if (!total.ok || total.headline.aggregate !== "sum" || total.provenance.masked.length > 0 || total.rows.length === 0) return null;
  const recent = await runPlain(totalOf(query, { compare: "none", range: { from: addDays(DATA_AS_OF, 1 - RECENT_DAYS), to: DATA_AS_OF } }), access);
  if (!recent.ok || recent.rows.length === 0) return null;
  const [actual, targetSoFar, recentTotal] = [total.rows[0].value, total.rows[0].compare_value, recent.rows[0].value].map(Number);
  if (![actual, targetSoFar, recentTotal].every(Number.isFinite)) return null;
  const projection = projectMonthEnd({
    actual,
    targetSoFar,
    elapsedDays: toDayIndex(DATA_AS_OF) - toDayIndex(query.range.from) + 1,
    monthDays: daysInMonthIndex(MONTH_OF_DAY[toDayIndex(DATA_AS_OF)]),
    recentDailyAverage: recentTotal / RECENT_DAYS,
  });
  if (!projection) return null;
  const monthTarget = Math.round(projection.monthTarget);
  const shortBy = projection.remaining > 0 ? formatGapForSummary(def, projection.remaining, monthTarget) : null;
  const endShort = projection.monthTarget - projection.projected;
  return {
    recentDays: RECENT_DAYS,
    projected: formatForSummary(def, Math.round(projection.projected)),
    monthTarget: formatForSummary(def, monthTarget),
    attainment: `${projection.attainment.toFixed(1)}%`,
    attainmentToDate: `${projection.attainmentToDate.toFixed(1)}%`,
    shortBy,
    endShortBy: endShort > 0 ? formatGapForSummary(def, endShort, monthTarget) : null,
    remaining: shortBy ? TH.dash.monthLeft(shortBy) : TH.dash.monthMet,
  };
}

/** Runs one certified metric query under the caller's access scope: Winyu plans and finishes, the metrics port only reads facts; a month-to-date total against target also says where the month ends. */
export async function runMetric(query: MetricQuery, access: AccessContext): Promise<MetricResult> {
  const result = await runPlain(query, access);
  if (!result.ok) return result;
  const projection = await monthEndProjection(query, access);
  if (!projection) return result;
  return { ...result, summary: `${result.summary} · ${TH.dash.monthSoFar(projection)} · ${TH.dash.monthEnd(projection)}`, headline: { ...result.headline, projection } };
}

export type { SeriesQuery };

/** One row of a series the engines read: the key of its dimension values, those values, and the aggregated value. */
export type SeriesRow = { key: string; dims: Record<Dim, string>; value: number };

/** The batch plane's reader for anomalies, forecasts, watches and hypotheses: the same aggregation as `runMetric` without access scoping, masking or the row cap, read through the metrics port like every answer. */
export async function readSeries(query: SeriesQuery): Promise<SeriesRow[]> {
  const request = seriesRequest(query, await loadDictionary());
  if (!request) return [];
  const [facts] = await ports().metrics.readFacts([request]);
  return facts?.ok ? keyRows(request.dims, facts.rows) : [];
}
