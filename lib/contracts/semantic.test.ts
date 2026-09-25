import { describe, expect, test } from "bun:test";
import { watchMetricInputSchema } from "./watches";

const QUERY = { metric: "net_sales_volume", dims: ["agent"], range: { from: "2026-09-01", to: "2026-09-25" }, grain: "month", compare: "prev_period", limit: null, sort: null };

describe("metric query filters", () => {
  test("a single value sent as a string is read as a list of one, so the tool call is not rejected", () => {
    const parsed = watchMetricInputSchema.parse({ title: "เตือน", condition: { kind: "change", value: 15 }, query: { ...QUERY, filters: { agent: "ag_nea_07" } } });
    expect(parsed.query.filters).toEqual({ agent: ["ag_nea_07"] });
  });

  test("anything that is neither a string nor a list of strings is still rejected", () => {
    expect(watchMetricInputSchema.safeParse({ title: "เตือน", condition: { kind: "change", value: 15 }, query: { ...QUERY, filters: { agent: 7 } } }).success).toBe(false);
  });
});
