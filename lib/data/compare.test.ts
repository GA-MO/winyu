import { describe, expect, test } from "bun:test";
import { METRIC_IDS, type AccessContext, type Dim, type MetricId, type MetricQuery, type MetricResult, type MetricRow } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { METRICS, TIME_DIMS } from "@/lib/semantic/metrics";
import { DATA_START, TODAY } from "./dates";
import { findUser } from "./entities/users";
import { runMetric } from "./query";

type Range = { from: string; to: string };
type Compare = "prev_period" | "prev_year";
type OkResult = Extract<MetricResult, { ok: true }>;

const MONTHLY_METRICS: ReadonlySet<MetricId> = new Set<MetricId>([
  "gross_margin", "trade_spend", "ar_overdue", "market_share", "forecast_mape", "headcount", "attrition_rate", "avg_salary",
]);
const SPARSE_METRICS: ReadonlySet<MetricId> = new Set<MetricId>(["campaign_spend", "campaign_reach", "campaign_uplift", "sentiment_score"]);
const COMPARES: readonly Compare[] = ["prev_period", "prev_year"];
const RANGES: Record<string, Range> = {
  "whole month": { from: "2026-08-01", to: "2026-08-31" },
  "month after a shorter one": { from: "2026-07-01", to: "2026-07-31" },
  "month after february": { from: "2026-03-01", to: "2026-03-31" },
  "month across new year": { from: "2026-01-01", to: "2026-01-31" },
  "month to date": { from: "2026-09-01", to: TODAY },
  quarter: { from: "2026-04-01", to: "2026-06-30" },
  week: { from: "2026-09-14", to: "2026-09-20" },
  "single day": { from: "2026-09-21", to: "2026-09-21" },
  "window across months": { from: "2026-07-15", to: "2026-08-14" },
  "last six months": { from: "2026-04-01", to: TODAY },
};
const MS_PER_DAY = 86_400_000;
const PREV_YEAR_DAYS = 364;
const MONTHS_PER_YEAR = 12;
const HEADLINE_DELTA_TOLERANCE = 0.15;

const CEO = contextFor("u_thana");
const RSM_NORTHEAST = contextFor("u_anucha");

function contextFor(userId: string): AccessContext {
  const user = findUser(userId);
  if (!user) throw new Error(`missing demo user ${userId}`);
  return accessFor(user);
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
}

function monthStart(value: string, back: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  return iso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - back, 1)));
}

function monthEnd(value: string, back: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  return iso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - back + 1, 0)));
}

function monthSpan(range: Range): number {
  const from = new Date(`${range.from}T00:00:00Z`);
  const to = new Date(`${range.to}T00:00:00Z`);
  return (to.getUTCFullYear() - from.getUTCFullYear()) * MONTHS_PER_YEAR + to.getUTCMonth() - from.getUTCMonth() + 1;
}

function sameDayOfMonth(value: string, back: number): string {
  const cut = `${monthStart(value, back).slice(0, 8)}${value.slice(8)}`;
  const end = monthEnd(value, back);
  return cut < end ? cut : end;
}

/** The prior window written in calendar terms, independent of the engine: whole months stay whole months, month-to-date cuts at the same day, any other window moves by its length (364 days for a year). */
function expectedPrior(metric: MetricId, compare: Compare, range: Range): Range {
  const startsMonth = range.from.endsWith("-01");
  const wholeMonths = MONTHLY_METRICS.has(metric) || (startsMonth && addDays(range.to, 1).endsWith("-01"));
  if (wholeMonths || (startsMonth && range.to === TODAY)) {
    const back = compare === "prev_year" ? MONTHS_PER_YEAR : monthSpan(range);
    return { from: monthStart(range.from, back), to: wholeMonths ? monthEnd(range.to, back) : sameDayOfMonth(range.to, back) };
  }
  const days = compare === "prev_year" ? PREV_YEAR_DAYS : Math.round((Date.parse(range.to) - Date.parse(range.from)) / MS_PER_DAY) + 1;
  return { from: addDays(range.from, -days), to: addDays(range.to, -days) };
}

function query(metric: MetricId, dims: Dim[], range: Range, compare: MetricQuery["compare"], extra: Partial<MetricQuery> = {}): MetricQuery {
  return { metric, dims, filters: {}, range, grain: "month", compare, limit: null, ...extra };
}

function run(request: MetricQuery, access: AccessContext = CEO): OkResult {
  const result = runMetric(request, access);
  if (!result.ok) throw new Error(`${request.metric}: ${result.error}`);
  return result;
}

function groupDimOf(metric: MetricId): Dim | null {
  return METRICS[metric].dims.find((dim) => !TIME_DIMS.includes(dim)) ?? null;
}

function valuesBy(rows: MetricRow[], dim: Dim): Map<string, number> {
  return new Map(rows.map((row) => [String(row[dim]), Number(row.value)]));
}

function expectClose(actual: unknown, expected: number, label: string): void {
  expect({ label, close: typeof actual === "number" && Math.abs(actual - expected) <= Math.max(1, Math.abs(expected) * 0.002) }).toEqual({ label, close: true });
}

const DENSE_METRICS = METRIC_IDS.filter((metric) => !SPARSE_METRICS.has(metric));

function eachCase(visit: (metric: MetricId, rangeName: string, range: Range, compare: Compare) => void): void {
  for (const metric of DENSE_METRICS) {
    for (const [rangeName, range] of Object.entries(RANGES)) {
      for (const compare of COMPARES) {
        if (expectedPrior(metric, compare, range).from < DATA_START) continue;
        visit(metric, rangeName, range, compare);
      }
    }
  }
}

describe("compare reads the calendar window the question means", () => {
  test("the total and every breakdown row compare against the prior window queried on its own", () => {
    eachCase((metric, rangeName, range, compare) => {
      const label = `${metric} · ${rangeName} · ${compare}`;
      const prior = expectedPrior(metric, compare, range);
      const total = run(query(metric, [], range, compare));
      if (total.rows.length === 0) return;
      expectClose(total.rows[0]?.compare_value, Number(run(query(metric, [], prior, "none")).rows[0]?.value), label);
      const group = groupDimOf(metric);
      if (!group) return;
      const truth = valuesBy(run(query(metric, [group], prior, "none")).rows, group);
      for (const row of run(query(metric, [group], range, compare)).rows) {
        const expected = truth.get(String(row[group]));
        if (expected !== undefined) expectClose(row.compare_value, expected, `${label} · ${row[group]}`);
      }
    });
  });

  test("a year-on-year question that reaches before the data compares the months both years hold, never a clipped prior", () => {
    const yearToDate = run(query("net_sales_volume", [], { from: "2026-01-01", to: TODAY }, "prev_year"));
    const comparable = run(query("net_sales_volume", [], { from: "2026-04-01", to: TODAY }, "prev_year"));
    expect(yearToDate.headline.periodLabel.startsWith("1 เม.ย. 2569")).toBe(true);
    expect(yearToDate.headline.value).toBe(comparable.headline.value);
    expect(yearToDate.headline.deltaPercent).toBe(comparable.headline.deltaPercent);
    expect(yearToDate.headline.compareNote).toContain("ข้อมูลเริ่ม 1 เม.ย. 2568");
    expect(yearToDate.summary).toContain(yearToDate.headline.compareNote ?? "");
    expect(comparable.headline.compareNote).toBeNull();
  });

  test("a comparison with nothing before it says so instead of vanishing", () => {
    const firstYear = run(query("attrition_rate", ["department"], { from: DATA_START, to: "2025-08-31" }, "prev_year"));
    expect(firstYear.headline.deltaPercent).toBeNull();
    expect(firstYear.rows[0]?.compare_value).toBeUndefined();
    expect(firstYear.headline.compareNote).toContain("ไม่มีข้อมูลให้เทียบปีก่อน");
  });
});

describe("one question gives one answer however it is broken down", () => {
  test("headline value and delta do not move with dims, grain or limit", () => {
    eachCase((metric, rangeName, range, compare) => {
      const label = `${metric} · ${rangeName} · ${compare}`;
      const base = run(query(metric, [], range, compare));
      const group = groupDimOf(metric);
      const timeDims = TIME_DIMS.filter((dim) => dim !== "date" && METRICS[metric].dims.includes(dim));
      const variants: [string, MetricQuery][] = [
        ...timeDims.flatMap((dim): [string, MetricQuery][] => [
          [`by ${dim}`, query(metric, [dim], range, compare)],
          [`by ${dim} grain ${dim}`, query(metric, [dim], range, compare, { grain: dim === "week" ? "week" : "month" })],
        ]),
        ["grain day", query(metric, [], range, compare, { grain: "day" })],
      ];
      if (group && metric !== "headcount") variants.push([`by ${group} limit 3`, query(metric, [group], range, compare, { limit: 3 })]);
      for (const [name, request] of variants) {
        const other = run(request);
        expect({ label, name, value: other.headline.value }).toEqual({ label, name, value: base.headline.value });
        if (base.headline.deltaPercent === null || other.headline.deltaPercent === null) continue;
        expect({ label, name, close: Math.abs(other.headline.deltaPercent - base.headline.deltaPercent) <= HEADLINE_DELTA_TOLERANCE }).toEqual({ label, name, close: true });
      }
    });
  });

  test("a top-N row keeps the compare value it has in the full breakdown", () => {
    eachCase((metric, rangeName, range, compare) => {
      const group = groupDimOf(metric);
      if (!group) return;
      const full = new Map(run(query(metric, [group], range, compare)).rows.map((row) => [String(row[group]), row.compare_value]));
      for (const row of run(query(metric, [group], range, compare, { limit: 3 })).rows) {
        expect({ at: `${metric} · ${rangeName} · ${compare} · ${row[group]}`, compare: row.compare_value })
          .toEqual({ at: `${metric} · ${rangeName} · ${compare} · ${row[group]}`, compare: full.get(String(row[group])) ?? null });
      }
    });
  });

  test("monthly rows each carry a compare value", () => {
    eachCase((metric, rangeName, range, compare) => {
      if (!METRICS[metric].dims.includes("month")) return;
      for (const row of run(query(metric, ["month"], range, compare)).rows) {
        expect({ at: `${metric} · ${rangeName} · ${compare} · ${row.month}`, has: typeof row.compare_value === "number" })
          .toEqual({ at: `${metric} · ${rangeName} · ${compare} · ${row.month}`, has: true });
      }
    });
  });

  test("a weekly metric asked for one month answers with that month only", () => {
    const august = run(query("share_of_voice", ["month"], RANGES["whole month"], "none"));
    expect(august.rows.map((row) => row.month)).toEqual(["2026-08"]);
  });

  test("a scoped persona compares within its scope", () => {
    eachCase((metric, rangeName, range, compare) => {
      if (!METRICS[metric].dims.includes("region")) return;
      const scoped = runMetric(query(metric, [], range, compare), RSM_NORTHEAST);
      if (!scoped.ok || typeof scoped.rows[0]?.compare_value !== "number") return;
      const filtered = run(query(metric, [], range, compare, { filters: { region: ["northeast"] } }));
      expectClose(scoped.rows[0].compare_value, Number(filtered.rows[0]?.compare_value), `${metric} · ${rangeName} · ${compare}`);
    });
  });
});
