import { describe, expect, test } from "bun:test";
import type { MetricQuery, MetricResult } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { USERS } from "@/lib/data/entities/users";
import { visitsFor } from "@/lib/server/dashboard";
import { weakestRow } from "./present";

const RANGE = { from: "2026-09-01", to: "2026-09-22" };

function queryOf(metric: MetricQuery["metric"], dims: MetricQuery["dims"]): MetricQuery {
  return { metric, dims, filters: {}, range: RANGE, grain: "month", compare: "none", limit: 10 };
}

function resultOf(rows: Record<string, string | number>[]): MetricResult {
  return {
    ok: true,
    rows,
    summary: "",
    headline: { aggregate: "average", value: "", periodLabel: "", rowCount: rows.length, deltaPercent: null, compareLabel: null, top: [] },
    provenance: { metric: "target_attainment", certified: true, sourceSystem: "SAP SD", asOf: "2026-09-22", rowCount: rows.length, filtersApplied: {}, scopeApplied: {}, masked: [], trust: "verified" },
  } as MetricResult;
}

function accessOf(userId: string) {
  const user = USERS.find((entry) => entry.id === userId);
  if (!user) throw new Error(userId);
  return accessFor(user);
}

describe("weakest row", () => {
  test("attainment by region names the lowest region", () => {
    const rows = [
      { region: "ภาคกลาง", value: 75.1, value_label: "75.1%" },
      { region: "ภาคอีสาน", value: 68.4, value_label: "68.4%" },
      { region: "ภาคใต้", value: 74.0, value_label: "74.0%" },
    ];
    expect(weakestRow(queryOf("target_attainment", ["region"]), resultOf(rows))).toEqual({ label: "ภาคอีสาน", value: "68.4%", lowIsWorst: true });
  });

  test("overdue receivables names the highest region", () => {
    const rows = [
      { region: "ภาคใต้", value: 13_100_000, value_label: "13.1 ล้านบาท" },
      { region: "ภาคเหนือ", value: 8_700_000, value_label: "8.7 ล้านบาท" },
    ];
    expect(weakestRow(queryOf("ar_overdue", ["region"]), resultOf(rows))?.label).toBe("ภาคใต้");
  });

  test("a volume ranking or a time series has no weakest row", () => {
    const rows = [
      { agent: "ก", value: 10 },
      { agent: "ข", value: 20 },
    ];
    expect(weakestRow(queryOf("net_sales_volume", ["agent"]), resultOf(rows))).toBeNull();
    expect(weakestRow(queryOf("days_of_cover", ["week"]), resultOf([{ week: "2026-W37", value: 12 }, { week: "2026-W38", value: 9 }]))).toBeNull();
  });
});

describe("visit list", () => {
  test("only field reps get one, capped at three, alerts and drops only", async () => {
    expect(await visitsFor(accessOf("u_thana"))).toEqual([]);
    const stops = await visitsFor(accessOf("u_krit"));
    expect(stops.length).toBeGreaterThan(0);
    expect(stops.length).toBeLessThanOrEqual(3);
    for (const stop of stops) expect(stop.reason.length).toBeGreaterThan(0);
  });
});
