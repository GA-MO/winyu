import { describe, expect, test } from "bun:test";
import { runMetric } from "@/lib/data/query";
import { findUser } from "@/lib/data/entities/users";
import { accessFor } from "./policies";
import { GENERATOR_MASTER } from "@/lib/data/master";
import { MIN_CELL_SIZE, SUPPRESSED_VALUE, cellScopeOf, cohortSize, isSmallCell } from "./suppression";

const CFO = accessFor(findUser("u_siriporn")!);
const RANGE = { from: "2026-08-01", to: "2026-09-22" };
const AR = { metric: "ar_overdue" as const, filters: {}, range: RANGE, grain: "month" as const, compare: "none" as const, limit: 40 };

describe("cohortSize", () => {
  test("counts the agents a cell aggregates", () => {
    expect(cohortSize(GENERATOR_MASTER, "ar_overdue", { province: ["pv_lamphun"] })).toBe(2);
    expect(cohortSize(GENERATOR_MASTER, "ar_overdue", { province: ["pv_phuket"] })).toBe(1);
    expect(cohortSize(GENERATOR_MASTER, "ar_overdue", { region: ["northeast"] })).toBeGreaterThan(MIN_CELL_SIZE);
  });

  test("counts employees for person-level metrics and ignores metrics without person risk", () => {
    expect(cohortSize(GENERATOR_MASTER, "avg_salary", { department: ["dept_executive"] })).toBe(24);
    expect(cohortSize(GENERATOR_MASTER, "net_sales_volume", { province: ["pv_phuket"] })).toBeNull();
  });
});

describe("isSmallCell", () => {
  test("a province roll-up below the minimum is a small cell", () => {
    expect(isSmallCell(GENERATOR_MASTER, "ar_overdue", ["province"], {}, cellScopeOf(["province"], { province: "pv_phuket" }))).toBe(true);
    expect(isSmallCell(GENERATOR_MASTER, "ar_overdue", ["province"], {}, cellScopeOf(["province"], { province: "pv_bangkok" }))).toBe(false);
  });

  test("naming the agent leaves the decision to the metric ACL", () => {
    expect(isSmallCell(GENERATOR_MASTER, "ar_overdue", ["agent"], {}, { agent: ["ag_sou_01"] })).toBe(false);
    expect(isSmallCell(GENERATOR_MASTER, "ar_overdue", ["month"], { agent: ["ag_sou_01"] }, {})).toBe(false);
  });
});

describe("runMetric with min-cell suppression", () => {
  test("hides the value of provinces served by fewer than three agents", () => {
    const result = runMetric({ ...AR, dims: ["province"] }, CFO);
    if (!result.ok) throw new Error(result.error);
    const phuket = result.rows.find((row) => row.province === "ภูเก็ต");
    const bangkok = result.rows.find((row) => row.province === "กรุงเทพมหานคร");
    expect(phuket?.value).toBe(SUPPRESSED_VALUE);
    expect(typeof bangkok?.value).toBe("number");
    expect(result.provenance.masked.length).toBeGreaterThan(0);
  });

  test("keeps suppressed rows out of the summary and reports how many were closed", () => {
    const result = runMetric({ ...AR, dims: ["province"] }, CFO);
    if (!result.ok) throw new Error(result.error);
    expect(result.summary).not.toContain("ภูเก็ต");
    expect(result.summary).toContain("ปิด");
  });

  test("region roll-ups and named agents stay readable", () => {
    const byRegion = runMetric({ ...AR, dims: ["region"] }, CFO);
    const byAgent = runMetric({ ...AR, dims: ["agent"] }, CFO);
    if (!byRegion.ok || !byAgent.ok) throw new Error("query failed");
    expect(byRegion.rows.every((row) => typeof row.value === "number")).toBe(true);
    expect(byAgent.rows.every((row) => typeof row.value === "number")).toBe(true);
  });

  test("volume metrics are never suppressed by cell size", () => {
    const result = runMetric({ ...AR, metric: "net_sales_volume", dims: ["province"] }, CFO);
    if (!result.ok) throw new Error(result.error);
    expect(result.rows.every((row) => row.value !== SUPPRESSED_VALUE)).toBe(true);
  });
});
