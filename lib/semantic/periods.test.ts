import { afterEach, describe, expect, test } from "bun:test";
import type { MetricResult } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { presentCard } from "@/lib/cards/present";
import { DATA_AS_OF, addDays, businessToday, daysBetween, formatThaiDate, monthStart } from "@/lib/data/dates";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { winyuTools } from "@/lib/server/agent/tools";
import { runWithAccess } from "@/lib/server/request-context";
import { coverageOf, periodWindow, recentWindow, resolveQuery } from "./periods";

const DEMO = { today: "2026-11-27", asOf: "2026-11-26" };
const BASE = { metric: "net_sales_volume" as const, dims: [], filters: {}, grain: "day" as const, compare: "none" as const, limit: null };
const savedToday = process.env.WINYU_TODAY;

afterEach(() => {
  if (savedToday === undefined) delete process.env.WINYU_TODAY;
  else process.env.WINYU_TODAY = savedToday;
});

describe("a named period becomes dates", () => {
  test("calendar periods sit around today, rolling ones end on the last data day", () => {
    expect(periodWindow("this_week", DEMO)).toEqual({ from: "2026-11-23", to: "2026-11-29" });
    expect(periodWindow("last_week", DEMO)).toEqual({ from: "2026-11-16", to: "2026-11-22" });
    expect(periodWindow("this_month", DEMO)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(periodWindow("last_month", DEMO)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(periodWindow("ytd", DEMO)).toEqual({ from: "2026-01-01", to: "2026-11-27" });
    expect(periodWindow("last_7_days", DEMO)).toEqual({ from: "2026-11-20", to: "2026-11-26" });
    expect(periodWindow("last_30_days", DEMO)).toEqual({ from: "2026-10-28", to: "2026-11-26" });
    expect(periodWindow("last_month", { today: "2027-01-04", asOf: "2027-01-03" })).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    expect(periodWindow("this_week", { today: "2026-03-01", asOf: "2026-02-28" })).toEqual({ from: "2026-02-23", to: "2026-03-01" });
  });

  test("the gap line names how much of a running period the data holds, and nothing when the period is whole", () => {
    expect(coverageOf({ from: "2026-11-01", to: "2026-11-30" }, "this_month", "2026-11-26")).toEqual({
      from: "2026-11-01", to: "2026-11-30", through: "2026-11-26", days: 30, coveredDays: 26, label: TH.period.partial("เดือนนี้", 26, "26 พ.ย. 2569"),
    });
    expect(coverageOf({ from: "2026-11-23", to: "2026-11-29" }, "this_week", "2026-11-26").label).toBe("สัปดาห์นี้มีข้อมูล 4 วัน (ถึง 26 พ.ย. 2569)");
    expect(coverageOf({ from: "2026-10-01", to: "2026-10-31" }, "last_month", "2026-11-26").label).toBeNull();
    expect(coverageOf({ from: "2026-11-01", to: "2026-12-15" }, null, "2026-11-26").label).toBe("ข้อมูลถึง 26 พ.ย. 2569");
    expect(coverageOf({ from: "2026-12-01", to: "2026-12-15" }, null, "2026-11-26")).toMatchObject({ coveredDays: 0, label: TH.period.rangeAfterData("26 พ.ย. 2569") });
  });

  test("a period is cut at the last data day and kept on the query; with neither period nor dates, or no data yet, the model is told", () => {
    const resolved = resolveQuery({ ...BASE, range: null, period: "this_month" });
    expect(resolved).toEqual({ ok: true, query: { ...BASE, range: { from: monthStart(businessToday()), to: DATA_AS_OF }, period: "this_month" } });
    expect(resolveQuery({ ...BASE, range: { from: "2026-08-01", to: "2026-08-31" } })).toEqual({ ok: true, query: { ...BASE, range: { from: "2026-08-01", to: "2026-08-31" }, period: null } });
    expect(resolveQuery({ ...BASE, range: null, period: null })).toEqual({ ok: false, error: TH.period.missing, code: "BAD_QUERY" });
    process.env.WINYU_TODAY = addDays(DATA_AS_OF, 40);
    expect(resolveQuery({ ...BASE, range: null, period: "this_week" })).toEqual({ ok: false, error: TH.period.none("สัปดาห์นี้", formatThaiDate(DATA_AS_OF)), code: "BAD_QUERY" });
  });
});

describe("query_metric with a period", () => {
  test("answers from the first of the month to the last data day, and the summary and the card's source line say how far the data reaches", async () => {
    const ceo = findUser("u_thana");
    if (!ceo) throw new Error("no CEO");
    const tool = winyuTools().query_metric;
    const result = (await runWithAccess(accessFor(ceo), () => tool.execute(tool.inputSchema().parse({ ...BASE, dims: ["region"], range: null, period: "this_month" })))) as Extract<MetricResult, { ok: true }> & { query: typeof BASE & { range: { from: string; to: string } } };
    const label = TH.period.partial("เดือนนี้", daysBetween(monthStart(businessToday()), DATA_AS_OF) + 1, formatThaiDate(DATA_AS_OF));
    expect(result.query.range).toEqual({ from: monthStart(businessToday()), to: DATA_AS_OF });
    expect(result.provenance.coverage?.label).toBe(label);
    expect(result.summary).toContain(label);
    expect(presentCard({ title: "t", query: result.query, result }).footer?.details).toContain(label);
  });

  test("dates wholly after the data are refused with the last data day, not answered from it", async () => {
    const ceo = findUser("u_thana");
    if (!ceo) throw new Error("no CEO");
    const tool = winyuTools().query_metric;
    const after = { from: addDays(DATA_AS_OF, 3), to: addDays(DATA_AS_OF, 9) };
    const result = await runWithAccess(accessFor(ceo), () => tool.execute(tool.inputSchema().parse({ ...BASE, range: after })));
    expect(result).toMatchObject({ ok: false, code: "BAD_QUERY", error: TH.period.rangeAfterData(formatThaiDate(DATA_AS_OF)) });
  });
});

describe("the last N days, weeks or months (AI-331)", () => {
  const AS_OF = "2026-11-26";

  test("'12 สัปดาห์ล่าสุด' of a sum is the 12 whole weeks the data has finished, Monday to Sunday, so the card draws exactly 12", () => {
    const window = recentWindow({ count: 12, unit: "week" }, "net_sales_volume", AS_OF);
    expect(window).toEqual({ from: "2026-08-31", to: "2026-11-22" });
    expect((daysBetween(window.from, window.to) + 1) / 7).toBe(12);
  });

  test("a balance keeps the running week or month as its last bucket, as its card does", () => {
    expect(recentWindow({ count: 6, unit: "month" }, "ar_overdue", AS_OF)).toEqual({ from: "2026-06-01", to: AS_OF });
    expect(recentWindow({ count: 4, unit: "week" }, "days_of_cover", AS_OF)).toEqual({ from: "2026-11-02", to: AS_OF });
  });

  test("months of a sum end with the last finished month; days end on the last data day; a finished bucket on the last data day counts", () => {
    expect(recentWindow({ count: 3, unit: "month" }, "net_sales_value", AS_OF)).toEqual({ from: "2026-08-01", to: "2026-10-31" });
    expect(recentWindow({ count: 30, unit: "day" }, "net_sales_value", AS_OF)).toEqual({ from: "2026-10-28", to: AS_OF });
    expect(recentWindow({ count: 2, unit: "week" }, "net_sales_volume", "2026-11-29")).toEqual({ from: "2026-11-16", to: "2026-11-29" });
  });

  test("query_metric resolves `last` into those dates with no period and no limit", () => {
    const resolved = resolveQuery({ ...BASE, grain: "week", dims: ["week"], last: { count: 12, unit: "week" } });
    expect(resolved.ok && resolved.query.range).toEqual(recentWindow({ count: 12, unit: "week" }, "net_sales_volume"));
    expect(resolved.ok && resolved.query.period).toBeNull();
  });
});
