import type { Coverage, Grain, MetricId, MetricPeriod, MetricQuery, MetricQueryInput, RecentSpan } from "@/lib/contracts";
import { LEVEL_METRICS } from "@/lib/semantic/metrics";
import { DATA_AS_OF, DATA_START, addDays, businessToday, daysBetween, formatThaiDate, monthEnd, monthStart } from "@/lib/data/dates";
import { TH } from "@/lib/i18n/th";

type Range = { from: string; to: string };
type Clock = { today: string; asOf: string };

const DAYS_PER_WEEK = 7;
const ROLLING_MONTH_DAYS = 30;
const COUNTED_PERIODS: ReadonlySet<MetricPeriod> = new Set<MetricPeriod>(["this_week", "this_month"]);

function mondayOf(iso: string): string {
  const weekday = new Date(`${iso}T00:00:00.000Z`).getUTCDay();
  return addDays(iso, -((weekday + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK));
}

function weekFrom(monday: string): Range {
  return { from: monday, to: addDays(monday, DAYS_PER_WEEK - 1) };
}

/** Calendar periods sit around Winyu's today; rolling ones end on the last data day, so "the last 7 days" always has 7 days of data. */
const PERIOD_WINDOWS: Record<MetricPeriod, (clock: Clock) => Range> = {
  this_week: ({ today }) => weekFrom(mondayOf(today)),
  last_week: ({ today }) => weekFrom(addDays(mondayOf(today), -DAYS_PER_WEEK)),
  this_month: ({ today }) => ({ from: monthStart(today), to: monthEnd(today) }),
  last_month: ({ today }) => ({ from: monthStart(today, 1), to: monthEnd(today, 1) }),
  ytd: ({ today }) => ({ from: `${today.slice(0, 4)}-01-01`, to: today }),
  last_7_days: ({ asOf }) => ({ from: addDays(asOf, 1 - DAYS_PER_WEEK), to: asOf }),
  last_30_days: ({ asOf }) => ({ from: addDays(asOf, 1 - ROLLING_MONTH_DAYS), to: asOf }),
};

function clockNow(): Clock {
  return { today: businessToday(), asOf: DATA_AS_OF };
}

/** The whole calendar window a named period covers, before it is cut at the last data day. */
export function periodWindow(period: MetricPeriod, clock: Clock = clockNow()): Range {
  return PERIOD_WINDOWS[period](clock);
}

function gapLabel(window: Range, period: MetricPeriod | null, through: string, coveredDays: number, asOf: string): string | null {
  if (window.to <= asOf) return null;
  const day = formatThaiDate(asOf);
  if (coveredDays === 0) return period ? TH.period.none(TH.period.name[period] ?? period, day) : TH.period.rangeAfterData(day);
  if (period && COUNTED_PERIODS.has(period)) return TH.period.partial(TH.period.name[period] ?? period, coveredDays, formatThaiDate(through));
  return TH.period.through(day);
}

/** How much of a window the warehouse holds and the line that names what is missing. */
export function coverageOf(window: Range, period: MetricPeriod | null, asOf: string = DATA_AS_OF): Coverage {
  const through = window.to < asOf ? window.to : asOf;
  const start = window.from > DATA_START ? window.from : DATA_START;
  const coveredDays = Math.max(0, daysBetween(start, through) + 1);
  return { from: window.from, to: window.to, through, days: daysBetween(window.from, window.to) + 1, coveredDays, label: gapLabel(window, period, through, coveredDays, asOf) };
}

/** The coverage of a resolved query: the period's own window while the query still starts where the period does, else the dates it reads. */
export function coverageOfQuery(query: MetricQuery): Coverage {
  const window = query.period ? periodWindow(query.period) : null;
  return window && window.from === query.range.from ? coverageOf(window, query.period ?? null) : coverageOf(query.range, null);
}

function bucketStart(grain: Grain, iso: string): string {
  if (grain === "week") return mondayOf(iso);
  return grain === "month" ? monthStart(iso) : iso;
}

function bucketEnd(grain: Grain, start: string): string {
  if (grain === "week") return addDays(start, DAYS_PER_WEEK - 1);
  return grain === "month" ? monthEnd(start) : start;
}

/** The last day of the latest bucket a card draws: the running one for a level, which its card keeps, else the last one the data has finished. */
function lastDrawnDay(grain: Grain, asOf: string, keepsRunning: boolean): string {
  const start = bucketStart(grain, asOf);
  if (keepsRunning || bucketEnd(grain, start) === asOf) return asOf;
  return addDays(start, -1);
}

function spanStart(span: RecentSpan, end: string): string {
  if (span.unit === "day") return addDays(end, 1 - span.count);
  if (span.unit === "week") return addDays(end, 1 - DAYS_PER_WEEK * span.count);
  const [year, month, day] = end.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1 - span.count, (day ?? 1) + 1)).toISOString().slice(0, 10);
}

/** The last `count` days, weeks or months, drawn in `grain` buckets: they end with the last bucket the data has finished (the running one for a level such as stock, cover, overdue or headcount, which its card keeps) and start on the first whole bucket inside the span, so "12 สัปดาห์ล่าสุด" is exactly 12 weeks and "2 เดือนล่าสุด" by week reaches the latest finished week. */
export function recentWindow(span: RecentSpan, grain: Grain, metric: MetricId, asOf: string = DATA_AS_OF): Range {
  const to = lastDrawnDay(grain, asOf, LEVEL_METRICS.has(metric));
  const rough = spanStart(span, to);
  const from = bucketStart(grain, rough) === rough ? rough : addDays(bucketEnd(grain, bucketStart(grain, rough)), 1);
  return { from, to };
}

export type PeriodResolution = { ok: true; query: MetricQuery } | { ok: false; error: string; code: "BAD_QUERY" };

/** Turns what the model asked into dates: a named period becomes its calendar window cut at the last data day, the last N buckets their whole buckets; explicit dates pass through. */
export function resolveQuery(input: MetricQueryInput): PeriodResolution {
  const { period, range, last, ...rest } = input;
  if (last && !period) return { ok: true, query: { ...rest, range: recentWindow(last, input.grain, input.metric), period: null } };
  if (period) {
    const window = periodWindow(period);
    const coverage = coverageOf(window, period);
    if (coverage.coveredDays === 0) return { ok: false, error: coverage.label ?? TH.period.missing, code: "BAD_QUERY" };
    return { ok: true, query: { ...rest, range: { from: window.from, to: coverage.through }, period } };
  }
  if (!range) return { ok: false, error: TH.period.missing, code: "BAD_QUERY" };
  return { ok: true, query: { ...rest, range, period: null } };
}
