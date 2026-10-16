import type { Coverage, MetricPeriod, MetricQuery, MetricQueryInput } from "@/lib/contracts";
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

export type PeriodResolution = { ok: true; query: MetricQuery } | { ok: false; error: string; code: "BAD_QUERY" };

/** Turns what the model asked into dates: a named period becomes its calendar window cut at the last data day; explicit dates pass through. */
export function resolveQuery(input: MetricQueryInput): PeriodResolution {
  const { period, range, ...rest } = input;
  if (period) {
    const window = periodWindow(period);
    const coverage = coverageOf(window, period);
    if (coverage.coveredDays === 0) return { ok: false, error: coverage.label ?? TH.period.missing, code: "BAD_QUERY" };
    return { ok: true, query: { ...rest, range: { from: window.from, to: coverage.through }, period } };
  }
  if (!range) return { ok: false, error: TH.period.missing, code: "BAD_QUERY" };
  return { ok: true, query: { ...rest, range, period: null } };
}
