import { afterEach, describe, expect, test } from "bun:test";
import { findUser } from "@/lib/data/entities/users";
import { runMetric } from "@/lib/data/query";
import { liveAccessFor, toolsFor } from "./enforce";
import { cycleMetricVisibility, overrideFor, permissionsFor, resetRoleOverrides, roleOverrides, toggleRoleTool } from "./role-overrides";

const ADMIN = "u_ton";
const RANGE = { from: "2026-09-01", to: "2026-09-22" };

function live(userId: string) {
  const user = findUser(userId);
  if (!user) throw new Error(`no user ${userId}`);
  return liveAccessFor(user);
}

afterEach(() => {
  resetRoleOverrides();
});

describe("role overrides", () => {
  test("cycling a metric changes what the role's queries return, and three clicks bring back the default", () => {
    expect(permissionsFor("sales_rep").metricAcl.net_sales_volume).toBe("full");
    expect(cycleMetricVisibility("sales_rep", "net_sales_volume", ADMIN)).toBe("masked");
    expect(cycleMetricVisibility("sales_rep", "net_sales_volume", ADMIN)).toBe("none");
    expect(live("u_krit").metricAcl.net_sales_volume).toBe("none");
    const denied = runMetric({ metric: "net_sales_volume", dims: [], filters: {}, range: RANGE, grain: "day", compare: "none", limit: 1 }, live("u_krit"));
    expect(denied.ok).toBe(false);
    expect(cycleMetricVisibility("sales_rep", "net_sales_volume", ADMIN)).toBe("full");
    expect(overrideFor("sales_rep", "metric", "net_sales_volume")).toBeNull();
  });

  test("a tool can be given to a role and taken back", () => {
    expect(toolsFor(live("u_krit"))).not.toContain("create_handoff");
    expect(toggleRoleTool("sales_rep", "create_handoff", ADMIN)).toBe(true);
    expect(toolsFor(live("u_krit"))).toContain("create_handoff");
    expect(toggleRoleTool("sales_rep", "create_handoff", ADMIN)).toBe(false);
    expect(roleOverrides()).toHaveLength(0);
  });

  test("a destructive tool is never given outside the roles the surface names", () => {
    expect(toggleRoleTool("sales_rep", "run_job", ADMIN)).toBe(false);
    expect(toolsFor(live("u_krit"))).not.toContain("run_job");
    expect(toggleRoleTool("it_admin", "run_job", ADMIN)).toBe(false);
    expect(toolsFor(live(ADMIN))).not.toContain("run_job");
  });
});
