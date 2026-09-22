import { describe, expect, test } from "bun:test";
import type { AccessContext, Dim, MetricQuery } from "@/lib/contracts";
import { METRIC_IDS } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { METRICS } from "@/lib/semantic/metrics";
import { warmAll } from "./cache";
import { DATA_START, TODAY } from "./dates";
import { findUser } from "./entities/users";
import { describeEntity, listMetrics, runMetric } from "./query";

const QUERY_BUDGET_MS = 200;

function contextFor(userId: string): AccessContext {
  const user = findUser(userId);
  if (!user) throw new Error(`missing demo user ${userId}`);
  return accessFor(user);
}

function query(partial: Partial<MetricQuery> & { metric: MetricQuery["metric"] }): MetricQuery {
  return {
    dims: [], filters: {}, range: { from: "2026-04-01", to: "2026-09-22" },
    grain: "month", compare: "none", limit: null, ...partial,
  };
}

function totalOf(result: ReturnType<typeof runMetric>): number {
  if (!result.ok) throw new Error(result.error);
  return result.rows.reduce((sum, row) => sum + Number(row.value ?? 0), 0);
}

const CEO = contextFor("u_thana");
const RSM_NORTHEAST = contextFor("u_anucha");
const SALES_REP = contextFor("u_krit");
const HR = contextFor("u_may");
const SUPPLY = contextFor("u_wee");

describe("metric registry coverage", () => {
  test("every MetricId is answerable for its owner role", () => {
    for (const metric of METRIC_IDS) {
      const def = METRICS[metric];
      expect(def).toBeDefined();
      const groupDim = def.dims.find((dim) => !["date", "week", "month"].includes(dim)) ?? def.dims[0];
      const result = runMetric(query({ metric, dims: [groupDim as Dim], limit: 5 }), CEO);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.provenance.metric).toBe(metric);
      expect(result.provenance.asOf).toBe(TODAY);
      expect(result.provenance.trust).toBe(def.certified ? "verified" : "derived");
      expect(result.summary.length).toBeGreaterThan(10);
    }
  });
});

describe("validation", () => {
  test("unknown metric", () => {
    const result = runMetric(query({ metric: "made_up_metric" as MetricQuery["metric"] }), CEO);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("UNKNOWN_METRIC");
  });

  test("a dim outside the metric definition is rejected", () => {
    const result = runMetric(query({ metric: "headcount", dims: ["region"] }), HR);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("BAD_QUERY");
  });

  test("an unresolvable filter value is rejected", () => {
    const result = runMetric(query({ metric: "net_sales_volume", filters: { region: ["atlantis"] } }), CEO);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("BAD_QUERY");
  });

  test("filter values tolerate Thai aliases", () => {
    const byAlias = runMetric(query({ metric: "net_sales_volume", filters: { province: ["โคราช"] } }), CEO);
    const byId = runMetric(query({ metric: "net_sales_volume", filters: { province: ["pv_nakhonratchasima"] } }), CEO);
    expect(totalOf(byAlias)).toBe(totalOf(byId));
    const byNickname = runMetric(query({ metric: "net_sales_volume", filters: { brand: ["เบียร์สิงห์"] } }), CEO);
    const byBrandId = runMetric(query({ metric: "net_sales_volume", filters: { brand: ["singha"] } }), CEO);
    expect(totalOf(byNickname)).toBe(totalOf(byBrandId));
  });
});

describe("access control", () => {
  test("an RSM total equals the national total filtered to their region", () => {
    const scoped = runMetric(query({ metric: "net_sales_volume", dims: ["brand"] }), RSM_NORTHEAST);
    const national = runMetric(query({ metric: "net_sales_volume", dims: ["brand"], filters: { region: ["northeast"] } }), CEO);
    expect(totalOf(scoped)).toBe(totalOf(national));
    if (scoped.ok) expect(scoped.provenance.scopeApplied.region).toEqual(["northeast"]);
    if (national.ok) expect(national.provenance.scopeApplied.region).toBeUndefined();
  });

  test("an out-of-scope region filter is denied", () => {
    const result = runMetric(query({ metric: "net_sales_volume", filters: { region: ["south"] } }), RSM_NORTHEAST);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PERMISSION_DENIED");
  });

  test("an out-of-scope agent filter is denied", () => {
    const result = runMetric(query({ metric: "net_sales_volume", filters: { agent: ["ag_sou_01"] } }), RSM_NORTHEAST);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PERMISSION_DENIED");
  });

  test("a metric the role may not see is denied", () => {
    const result = runMetric(query({ metric: "headcount", dims: ["department"] }), RSM_NORTHEAST);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PERMISSION_DENIED");
  });

  test("avg_salary is masked for a sales rep and readable for HR", () => {
    const masked = runMetric(query({ metric: "avg_salary", dims: ["department"] }), SALES_REP);
    expect(masked.ok).toBe(true);
    if (masked.ok) {
      expect(masked.rows.every((row) => row.value === "***")).toBe(true);
      expect(masked.provenance.masked).toContain("value");
      expect(masked.summary).toContain("masked");
    }
    const visible = runMetric(query({ metric: "avg_salary", dims: ["department"] }), HR);
    expect(visible.ok).toBe(true);
    if (visible.ok) {
      expect(typeof visible.rows[0]?.value).toBe("number");
      expect(visible.provenance.masked).toEqual([]);
    }
  });

  test("masking hides the compare columns too", () => {
    const masked = runMetric(query({ metric: "avg_salary", dims: ["department"], compare: "prev_period" }), SALES_REP);
    expect(masked.ok).toBe(true);
    if (masked.ok) expect(masked.rows[0]?.compare_value).toBe("***");
  });
});

describe("aggregation and compare", () => {
  test("rows are capped and sorted by value for non-time dims", () => {
    const result = runMetric(query({ metric: "net_sales_volume", dims: ["agent"], limit: 5 }), CEO);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(5);
    const values = result.rows.map((row) => Number(row.value));
    expect([...values].sort((left, right) => right - left)).toEqual(values);
    expect(typeof result.rows[0]?.agent).toBe("string");
  });

  test("time dims come back ascending with ISO labels", () => {
    const result = runMetric(query({ metric: "net_sales_volume", dims: ["date"], range: { from: "2026-09-01", to: "2026-09-22" } }), CEO);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0]?.date).toBe("2026-09-01");
    expect(result.rows[result.rows.length - 1]?.date).toBe("2026-09-22");
  });

  test("the default row cap is 60", () => {
    const result = runMetric(query({ metric: "net_sales_volume", dims: ["date"], range: { from: DATA_START, to: TODAY } }), CEO);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rows).toHaveLength(60);
  });

  test("prev_period compares against the preceding months", () => {
    const result = runMetric(query({ metric: "net_sales_volume", dims: ["month"], compare: "prev_period" }), CEO);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.every((row) => row.compare_value !== undefined)).toBe(true);
    expect(typeof result.rows[0]?.delta_pct).toBe("number");
  });

  test("prev_year lines each month up with the same month a year earlier", () => {
    const result = runMetric(query({ metric: "net_sales_volume", dims: ["month"], compare: "prev_year" }), CEO);
    const lastYear = runMetric(query({ metric: "net_sales_volume", dims: ["month"], range: { from: "2025-04-01", to: "2025-09-22" } }), CEO);
    expect(result.ok && lastYear.ok).toBe(true);
    if (!result.ok || !lastYear.ok) return;
    const compareTotal = result.rows.reduce((sum, row) => sum + Number(row.compare_value ?? 0), 0);
    expect(Math.abs(compareTotal / totalOf(lastYear) - 1)).toBeLessThan(0.05);
  });

  test("target compare adds a target column and a sane attainment", () => {
    const result = runMetric(query({ metric: "net_sales_volume", dims: ["month"], compare: "target" }), CEO);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const row of result.rows) {
      expect(Number(row.compare_value)).toBeGreaterThan(0);
      expect(Math.abs(Number(row.delta_pct))).toBeLessThan(40);
    }
  });

  test("target compare is refused for a metric without targets", () => {
    const result = runMetric(query({ metric: "headcount", dims: ["department"], compare: "target" }), HR);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("BAD_QUERY");
  });

  test("channel splits add back up to the unsplit total", () => {
    const split = runMetric(query({ metric: "net_sales_volume", dims: ["channel"] }), CEO);
    const whole = runMetric(query({ metric: "net_sales_volume" }), CEO);
    expect(Math.abs(totalOf(split) / totalOf(whole) - 1)).toBeLessThan(0.001);
  });

  test("brand splits add back up to the unsplit total", () => {
    const split = runMetric(query({ metric: "net_sales_value", dims: ["brand", "region"] }), CEO);
    const whole = runMetric(query({ metric: "net_sales_value" }), CEO);
    expect(Math.abs(totalOf(split) / totalOf(whole) - 1)).toBeLessThan(0.001);
  });
});

describe("performance", () => {
  test("a single runMetric stays well under the budget on warm caches", () => {
    warmAll();
    const started = performance.now();
    const result = runMetric(query({ metric: "net_sales_volume", dims: ["region", "brand"], range: { from: DATA_START, to: TODAY } }), CEO);
    const elapsed = performance.now() - started;
    expect(result.ok).toBe(true);
    expect(elapsed).toBeLessThan(QUERY_BUDGET_MS);
  });
});

describe("metric and entity lookup", () => {
  test("listMetrics returns everything or a ranked subset", () => {
    expect(listMetrics(null)).toHaveLength(METRIC_IDS.length);
    expect(listMetrics("สต๊อก").map((def) => def.id)).toContain("stock_on_hand");
    expect(listMetrics("วันครอบคลุม")[0]?.id).toBe("days_of_cover");
    expect(listMetrics("เอเย่นต์").length).toBeGreaterThan(0);
  });

  test("describeEntity resolves Thai names and spelling variants", () => {
    const agent = describeEntity("agent", "ส.รุ่งเรือง");
    expect(agent.ok).toBe(true);
    if (agent.ok) expect(agent.data.id).toBe("ag_nea_07");
    const sku = describeEntity("sku", "ลีโอ 620");
    expect(sku.ok).toBe(true);
    if (sku.ok) expect(sku.data.id).toBe("sku_leo_bottle620");
    const dc = describeEntity("dc", "ลำพูน");
    expect(dc.ok).toBe(true);
    if (dc.ok) expect(dc.data.id).toBe("dc_lamphun");
    const campaign = describeEntity("campaign", "ซีสโตร์");
    expect(campaign.ok).toBe(true);
    const user = describeEntity("user", "คุณอนุชา");
    expect(user.ok).toBe(true);
    if (user.ok) expect(user.data.id).toBe("u_anucha");
    expect(describeEntity("agent", "ไม่มีเอเย่นต์นี้").ok).toBe(false);
  });

  test("a supply planner can read cover but not margin", () => {
    expect(runMetric(query({ metric: "days_of_cover", dims: ["dc"] }), SUPPLY).ok).toBe(true);
    expect(runMetric(query({ metric: "gross_margin", dims: ["business_unit"] }), SUPPLY).ok).toBe(false);
  });
});
