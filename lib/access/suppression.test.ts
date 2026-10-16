import { describe, expect, test } from "bun:test";
import { runMetric } from "@/lib/data/query";
import { findUser } from "@/lib/data/entities/users";
import { accessFor } from "./policies";
import { GENERATOR_MASTER } from "@/lib/data/master";
import { MIN_CELL_SIZE, SUPPRESSED_VALUE, cellScopeOf, cohortSize, isSmallCell } from "./suppression";

const CEO = accessFor(findUser("u_thana")!);
const CFO = accessFor(findUser("u_siriporn")!);
const RANGE = { from: "2026-08-01", to: "2026-09-22" };
const AR = { metric: "ar_overdue" as const, filters: {}, range: RANGE, grain: "month" as const, compare: "none" as const, limit: 40 };
const TINY_DEPARTMENT = { id: "dept_tiny", nameTh: "ฝ่ายเล็ก", label: "Tiny", headcount: MIN_CELL_SIZE - 1 };
const MASTER_WITH_TINY = { ...GENERATOR_MASTER, departments: [...GENERATOR_MASTER.departments, TINY_DEPARTMENT] };

describe("cohortSize", () => {
  test("counts employees for metrics about people", () => {
    expect(cohortSize(GENERATOR_MASTER, "avg_salary", { department: ["dept_executive"] })).toBe(24);
    expect(cohortSize(MASTER_WITH_TINY, "headcount", { department: ["dept_tiny"] })).toBe(MIN_CELL_SIZE - 1);
  });

  test("business metrics carry no cohort, whatever the grain", () => {
    expect(cohortSize(GENERATOR_MASTER, "ar_overdue", { province: ["pv_phuket"] })).toBeNull();
    expect(cohortSize(GENERATOR_MASTER, "gross_margin", { region: ["south"] })).toBeNull();
    expect(cohortSize(GENERATOR_MASTER, "net_sales_volume", { province: ["pv_phuket"] })).toBeNull();
  });
});

describe("isSmallCell", () => {
  test("a department of fewer than the minimum is a small cell for every people metric", () => {
    for (const metric of ["headcount", "attrition_rate", "avg_salary"] as const) {
      expect(isSmallCell(MASTER_WITH_TINY, metric, {}, cellScopeOf(["department"], { department: "dept_tiny" }))).toBe(true);
      expect(isSmallCell(MASTER_WITH_TINY, metric, {}, cellScopeOf(["department"], { department: "dept_sales" }))).toBe(false);
    }
  });

  test("a province served by one agent is not a small cell: overdue AR is a business figure", () => {
    expect(isSmallCell(GENERATOR_MASTER, "ar_overdue", {}, cellScopeOf(["province"], { province: "pv_phuket" }))).toBe(false);
  });
});

describe("runMetric and small cells", () => {
  test("overdue AR by province shows every province's value to the CEO, one-agent provinces included", () => {
    const result = runMetric({ ...AR, dims: ["province"] }, CEO);
    if (!result.ok) throw new Error(result.error);
    expect(result.rows.find((row) => row.province === "ภูเก็ต")?.value).toBeTypeOf("number");
    expect(result.rows.every((row) => row.value !== SUPPRESSED_VALUE)).toBe(true);
    expect(result.provenance.masked).toEqual([]);
    expect(result.provenance.suppressedRows).toBeUndefined();
    expect(result.summary).not.toContain("ปิด");
  });

  test("region roll-ups and named agents stay readable", () => {
    const byRegion = runMetric({ ...AR, dims: ["region"] }, CFO);
    const byAgent = runMetric({ ...AR, dims: ["agent"] }, CFO);
    if (!byRegion.ok || !byAgent.ok) throw new Error("query failed");
    expect(byRegion.rows.every((row) => typeof row.value === "number")).toBe(true);
    expect(byAgent.rows.every((row) => typeof row.value === "number")).toBe(true);
  });
});
