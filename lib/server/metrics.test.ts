import { afterEach, describe, expect, test } from "bun:test";
import type { FactRequest, FactResult, MetricQuery } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { SUPPRESSED_VALUE } from "@/lib/access/suppression";
import { findUser } from "@/lib/data/entities/users";
import { runMetric as runOnGenerator } from "@/lib/data/query";
import { ports, registerPorts, resetPorts } from "@/lib/server/ports";
import { runMetric } from "./metrics";

const REP = accessFor(findUser("u_krit")!);
const CFO = accessFor(findUser("u_siriporn")!);
const RANGE = { from: "2026-08-01", to: "2026-09-22" };
const REQUEST_KEYS = ["dims", "filters", "labelShift", "measure", "metric", "range"];

function question(partial: Partial<MetricQuery> & Pick<MetricQuery, "metric">): MetricQuery {
  return { dims: [], filters: {}, range: RANGE, grain: "month", compare: "none", limit: null, ...partial };
}

function recordingWarehouse(answer: (request: FactRequest) => FactResult): FactRequest[] {
  const seen: FactRequest[] = [];
  registerPorts({
    metrics: {
      ...ports().metrics,
      readFacts: async (requests) => {
        seen.push(...requests);
        return requests.map(answer);
      },
    },
  });
  return seen;
}

afterEach(() => resetPorts());

describe("runMetric over the metrics port", () => {
  test("the warehouse receives only requests already narrowed to the caller's scope", async () => {
    const seen = recordingWarehouse(() => ({ ok: true, rows: [] }));
    await runMetric(question({ metric: "net_sales_volume", dims: ["region"], compare: "prev_period" }), REP);
    expect(seen).toHaveLength(2);
    for (const request of seen) {
      expect(Object.keys(request).sort()).toEqual(REQUEST_KEYS);
      expect(request.filters.region).toEqual(REP.regions as string[]);
    }
  });

  test("a denied question never reaches the warehouse", async () => {
    const seen = recordingWarehouse(() => ({ ok: true, rows: [] }));
    const outOfRegion = await runMetric(question({ metric: "net_sales_volume", filters: { region: ["bangkok"] } }), REP);
    const hiddenMetric = await runMetric(question({ metric: "headcount" }), REP);
    expect(outOfRegion.ok ? null : outOfRegion.code).toBe("PERMISSION_DENIED");
    expect(hiddenMetric.ok ? null : hiddenMetric.code).toBe("PERMISSION_DENIED");
    expect(seen).toHaveLength(0);
  });

  test("a masked metric stays masked whatever numbers the warehouse sends", async () => {
    recordingWarehouse(() => ({ ok: true, rows: [{ dims: { department: "dept_sales" }, value: 48_000, weight: 120 }] }));
    const result = await runMetric(question({ metric: "avg_salary", dims: ["department"] }), CFO);
    if (!result.ok) throw new Error(result.error);
    expect(result.rows.every((row) => row.value === SUPPRESSED_VALUE)).toBe(true);
    expect(result.headline.value).toBe("—");
  });

  test("small cells from any warehouse are suppressed by Cop", async () => {
    recordingWarehouse(() => ({
      ok: true,
      rows: [
        { dims: { province: "pv_phuket" }, value: 1_000_000, weight: 1 },
        { dims: { province: "pv_bangkok" }, value: 9_000_000, weight: 1 },
      ],
    }));
    const result = await runMetric(question({ metric: "ar_overdue", dims: ["province"] }), CFO);
    if (!result.ok) throw new Error(result.error);
    expect(result.rows.find((row) => row.province === "ภูเก็ต")?.value).toBe(SUPPRESSED_VALUE);
    expect(result.rows.find((row) => row.province === "กรุงเทพมหานคร")?.value).toBe(9_000_000);
  });

  test("a warehouse failure is the answer's failure", async () => {
    recordingWarehouse(() => ({ ok: false, code: "BAD_QUERY", error: "warehouse busy" }));
    const result = await runMetric(question({ metric: "net_sales_volume" }), CFO);
    expect(result).toEqual({ ok: false, code: "BAD_QUERY", error: "warehouse busy" });
  });

  test("the generator port answers exactly as the in-process engine", async () => {
    const asked = question({ metric: "net_sales_volume", dims: ["province"], compare: "prev_year", sort: "delta_asc", limit: 5 });
    expect(await runMetric(asked, REP)).toEqual(runOnGenerator(asked, REP));
  });
});
