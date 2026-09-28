import type { Dim, MetricId } from "./semantic";

export type FactMeasure = "actual" | "target";

/** How far a row's time labels move forward, so a prior window's rows carry the labels of the window they are compared with. */
export type LabelShift = { days: number; months: number };

/** One aggregate asked of the warehouse: Winyu has already resolved, scoped and bounded it; the warehouse never sees who asked. */
export type FactRequest = {
  metric: MetricId;
  measure: FactMeasure;
  dims: Dim[];
  filters: Partial<Record<Dim, string[]>>;
  range: { from: string; to: string };
  labelShift: LabelShift;
};

/** One group of the aggregate: `weight` is the denominator for ratio metrics and 1 otherwise. */
export type FactRow = { dims: Partial<Record<Dim, string>>; value: number; weight: number };

export type FactResult = { ok: true; rows: FactRow[] } | { ok: false; code: "BAD_QUERY"; error: string };
