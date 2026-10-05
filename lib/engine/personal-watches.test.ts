import { describe, expect, test } from "bun:test";
import type { MetricQuery, MetricResult, MetricRow } from "@/lib/contracts";
import { checkWatch, nextState, rollingQuery, windowDaysOf } from "./personal-watches";

const QUERY: MetricQuery = { metric: "days_of_cover", dims: ["dc"], filters: { dc: ["dc_lamphun"] }, range: { from: "2026-09-08", to: "2026-09-22" }, grain: "day", compare: "none", limit: null };

function ok(rows: MetricRow[]): MetricResult {
  return { ok: true, rows } as unknown as MetricResult;
}

describe("a standing question", () => {
  test("keeps its look-back length and rolls to the latest day", () => {
    expect(windowDaysOf(QUERY)).toBe(14);
    const sales = { ...QUERY, metric: "net_sales_volume" as const, limit: 5 };
    const rolled = rollingQuery({ query: sales, windowDays: 14, condition: { kind: "below", value: 10 } }, "2026-10-05");
    expect(rolled.range).toEqual({ from: "2026-09-21", to: "2026-10-05" });
    expect(rolled.limit).toBeNull();
  });

  test("a stock level is read on the latest day, not averaged over the window", () => {
    expect(rollingQuery({ query: QUERY, windowDays: 14, condition: { kind: "below", value: 10 } }, "2026-10-05").range).toEqual({ from: "2026-10-05", to: "2026-10-05" });
  });

  test("a change watch compares with the previous period even if the question did not", () => {
    expect(rollingQuery({ query: QUERY, windowDays: 14, condition: { kind: "change", value: 10 } }).compare).toBe("prev_period");
  });

  test("reports the row that crosses furthest", () => {
    const check = checkWatch(ok([{ dc: "ลำพูน", value: 6.2 }, { dc: "เชียงใหม่", value: 8 }, { dc: "สงขลา", value: 13 }]), { kind: "below", value: 10 });
    expect(check.breached).toBe(true);
    expect(check.hit?.value).toBe(6.2);
    expect(checkWatch(ok([{ value: 13 }]), { kind: "below", value: 10 }).breached).toBe(false);
    expect(checkWatch(ok([{ value: 5, delta_pct: -14 }]), { kind: "change", value: 10 }).hit?.value).toBe(-14);
  });

  test("a denied query never fires", () => {
    expect(checkWatch({ ok: false, error: "x", code: "PERMISSION_DENIED" }, { kind: "below", value: 10 }).breached).toBe(false);
  });

  test("notifies when it crosses, stays quiet while it stays over, re-arms when it comes back", () => {
    expect(nextState("ok", true)).toEqual({ state: "triggered", notify: true });
    expect(nextState("triggered", true)).toEqual({ state: "triggered", notify: false });
    expect(nextState("triggered", false)).toEqual({ state: "ok", notify: false });
  });
});
