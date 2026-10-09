import type { AccessContext, MetricQuery, MetricResult, MonthEndProjection } from "@/lib/contracts";
import { isTimeDim } from "@/lib/cards/rows";
import { MONTH_OF_DAY, TODAY, addDays, daysInMonthIndex, toDayIndex } from "@/lib/data/dates";
import { projectMonthEnd } from "@/lib/engine/gap";
import { TH } from "@/lib/i18n/th";
import { comparisonRequestOf, finishMetric, formatForSummary, planMetric } from "@/lib/semantic/engine";
import { metricDef } from "@/lib/semantic/metrics";
import { loadDictionary } from "@/lib/server/master-data";
import { ports } from "@/lib/server/ports";
import { unlessPortDown } from "@/lib/server/ports/unavailable";

const RECENT_DAYS = 7;

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

function isMonthToDateVsTarget(query: MetricQuery): boolean {
  return query.compare === "target" && query.range.from === monthStartOf(TODAY) && query.range.to === TODAY && !query.dims.some(isTimeDim);
}

function totalOf(query: MetricQuery, overrides: Partial<MetricQuery>): MetricQuery {
  return { ...query, dims: [], limit: null, sort: null, where: null, ...overrides };
}

/** Where a month-to-date total against target ends if the days left sell at the last seven days' pace, against the target spread evenly over the month; null for any other question. */
export async function monthEndProjection(query: MetricQuery, access: AccessContext): Promise<MonthEndProjection | null> {
  const def = metricDef(query.metric);
  if (!def || !isMonthToDateVsTarget(query)) return null;
  const total = await runPlain(totalOf(query, {}), access);
  if (!total.ok || total.headline.aggregate !== "sum" || total.provenance.masked.length > 0 || total.rows.length === 0) return null;
  const recent = await runPlain(totalOf(query, { compare: "none", range: { from: addDays(TODAY, 1 - RECENT_DAYS), to: TODAY } }), access);
  if (!recent.ok || recent.rows.length === 0) return null;
  const [actual, targetSoFar, recentTotal] = [total.rows[0].value, total.rows[0].compare_value, recent.rows[0].value].map(Number);
  if (![actual, targetSoFar, recentTotal].every(Number.isFinite)) return null;
  const projection = projectMonthEnd({
    actual,
    targetSoFar,
    elapsedDays: toDayIndex(TODAY) - toDayIndex(query.range.from) + 1,
    monthDays: daysInMonthIndex(MONTH_OF_DAY[toDayIndex(TODAY)]),
    recentDailyAverage: recentTotal / RECENT_DAYS,
  });
  if (!projection) return null;
  return {
    recentDays: RECENT_DAYS,
    projected: formatForSummary(def, Math.round(projection.projected)),
    monthTarget: formatForSummary(def, Math.round(projection.monthTarget)),
    attainment: `${projection.attainment.toFixed(1)}%`,
  };
}

/** Runs one certified metric query under the caller's access scope: Winyu plans and finishes, the metrics port only reads facts; a month-to-date total against target also says where the month ends. */
export async function runMetric(query: MetricQuery, access: AccessContext): Promise<MetricResult> {
  const result = await runPlain(query, access);
  if (!result.ok) return result;
  const projection = await monthEndProjection(query, access);
  if (!projection) return result;
  return { ...result, summary: `${result.summary} · ${TH.dash.monthEnd(projection)}`, headline: { ...result.headline, projection } };
}
