import { describe, expect, test } from "bun:test";
import type { MetricQuery, MetricRow, MetricSort } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "./entities/users";
import { runMetric } from "./query";

const CEO = accessFor(findUser("u_thana")!);
const RSM = accessFor(findUser("u_anucha")!);
const TOP = 10;

function queryOf(sort: MetricSort | null, limit: number | null, metric: MetricQuery["metric"] = "net_sales_volume"): MetricQuery {
  return { metric, dims: ["agent"], filters: {}, range: { from: "2026-08-01", to: "2026-08-31" }, grain: "month", compare: "prev_period", limit, sort };
}

function rowsOf(query: MetricQuery, access = CEO): MetricRow[] {
  const result = runMetric(query, access);
  if (!result.ok) throw new Error(result.error);
  return result.rows;
}

function namesOf(rows: MetricRow[]): string[] {
  return rows.map((row) => String(row.agent));
}

function byDelta(rows: MetricRow[], sign: number): MetricRow[] {
  return [...rows].filter((row) => typeof row.delta_pct === "number").sort((left, right) => sign * (Number(left.delta_pct) - Number(right.delta_pct)));
}

function expectCutAt(kept: MetricRow[], all: MetricRow[], sign: number) {
  const keptNames = new Set(namesOf(kept));
  const worstKept = Math.max(...kept.map((row) => sign * Number(row.delta_pct)));
  const bestLeftOut = Math.min(...byDelta(all, sign).filter((row) => !keptNames.has(String(row.agent))).map((row) => sign * Number(row.delta_pct)));
  expect(worstKept).toBeLessThanOrEqual(bestLeftOut);
  expect(kept.map((row) => sign * Number(row.delta_pct))).toEqual(kept.map((row) => sign * Number(row.delta_pct)).sort((left, right) => left - right));
}

describe("a limit cuts after the order the question asked for", () => {
  test("the ten that fell most are the ten with the lowest change among all agents", () => {
    const all = rowsOf(queryOf(null, null));
    expectCutAt(rowsOf(queryOf("delta_asc", TOP)), all, 1);
  });

  test("the ten that grew most, likewise", () => {
    const all = rowsOf(queryOf(null, null));
    expectCutAt(rowsOf(queryOf("delta_desc", TOP)), all, -1);
  });

  test("the lowest ten by value", () => {
    const all = rowsOf(queryOf(null, null));
    const lowest = [...all].sort((left, right) => Number(left.value) - Number(right.value)).slice(0, TOP);
    expect(namesOf(rowsOf(queryOf("value_asc", TOP)))).toEqual(namesOf(lowest));
  });

  test("a regional manager's top decliners stay inside the region", () => {
    const all = rowsOf(queryOf(null, null), RSM);
    expectCutAt(rowsOf(queryOf("delta_asc", 5), RSM), all, 1);
  });

  test("the headline does not move with the sort", () => {
    const plain = runMetric(queryOf(null, TOP), CEO);
    const sorted = runMetric(queryOf("delta_asc", TOP), CEO);
    expect(plain.ok && sorted.ok && plain.headline.value === sorted.headline.value).toBe(true);
  });

  test("without a sort the old order holds: largest first", () => {
    const rows = rowsOf(queryOf(null, TOP));
    const values = rows.map((row) => Number(row.value));
    expect(values).toEqual([...values].sort((left, right) => right - left));
  });
});
