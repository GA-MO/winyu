import { describe, expect, test } from "bun:test";
import { DIMS, METRIC_IDS } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { BRAND_SCOPE_DIMS, METRICS, METRIC_LIST, REGION_SCOPE_DIMS, findMetric, metricDef, metricsOwnedBy } from "./metrics";

const REQUIRED_SYNONYMS = ["เอเย่นต์", "ซับเอเย่นต์", "ลัง", "โหล", "เฮกโตลิตร", "ยอดขาย", "สต๊อก", "วันครอบคลุม"];

describe("metric definitions", () => {
  test("every MetricId has a complete definition", () => {
    expect(METRIC_LIST).toHaveLength(METRIC_IDS.length);
    for (const id of METRIC_IDS) {
      const def = METRICS[id];
      expect(def.id).toBe(id);
      expect(def.labelTh.length).toBeGreaterThan(1);
      expect(def.unit.length).toBeGreaterThan(0);
      expect(["number", "currency", "percent"]).toContain(def.format);
      expect(def.description.length).toBeGreaterThan(20);
      expect(def.sourceSystem.length).toBeGreaterThan(1);
      expect(def.synonyms.length).toBeGreaterThanOrEqual(4);
      expect(def.dims.length).toBeGreaterThan(0);
      expect(def.dims.every((dim) => DIMS.includes(dim))).toBe(true);
      expect(findUser(def.owner)).not.toBeNull();
    }
  });

  test("aclDims are the scope carrying dims of each metric", () => {
    for (const def of METRIC_LIST) {
      const expected = def.dims.filter((dim) => REGION_SCOPE_DIMS.includes(dim) || BRAND_SCOPE_DIMS.includes(dim));
      expect(def.aclDims).toEqual(expected);
      expect(def.aclDims.every((dim) => def.dims.includes(dim))).toBe(true);
    }
  });

  test("the vocabulary the personas use is covered", () => {
    const vocabulary = new Set(METRIC_LIST.flatMap((def) => def.synonyms));
    for (const word of REQUIRED_SYNONYMS) expect(vocabulary.has(word)).toBe(true);
  });

  test("certified metrics come from a system of record", () => {
    const certified = METRIC_LIST.filter((def) => def.certified).map((def) => def.sourceSystem);
    expect(new Set(certified)).toEqual(new Set(["SAP SD", "WMS", "MES", "SAP FI", "HRIS"]));
  });
});

describe("findMetric", () => {
  test("ranks the obvious Thai phrasing first", () => {
    expect(findMetric("ยอดขายเข้า")[0]?.id).toBe("net_sales_volume");
    expect(findMetric("วันครอบคลุม")[0]?.id).toBe("days_of_cover");
    expect(findMetric("เงินเดือน")[0]?.id).toBe("avg_salary");
    expect(findMetric("mape")[0]?.id).toBe("forecast_mape");
    expect(findMetric("share of voice")[0]?.id).toBe("share_of_voice");
    expect(findMetric("กำไรขั้นต้น")[0]?.id).toBe("gross_margin");
  });

  test("returns everything for empty text and nothing for nonsense", () => {
    expect(findMetric("")).toHaveLength(METRIC_IDS.length);
    expect(findMetric("zzzqqq")).toHaveLength(0);
  });

  test("metricDef and metricsOwnedBy read the registry", () => {
    expect(metricDef("net_sales_volume")?.owner).toBe("u_prasit");
    expect(metricDef("nope")).toBeNull();
    expect(metricsOwnedBy("u_may").map((def) => def.id).sort()).toEqual(["attrition_rate", "avg_salary", "headcount"]);
  });
});
