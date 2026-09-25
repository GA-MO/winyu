import { afterEach, describe, expect, test } from "bun:test";
import { findUser } from "@/lib/data/entities/users";
import { runMetric } from "@/lib/data/query";
import { liveAccessFor, toolsFor } from "./enforce";
import { cycleMetricVisibility, defaultOf, overrideFor, removeOverride, setFieldVisibility, setMetricVisibility, setRoleTool, permissionsFor, resetRoleOverrides, roleOverrides, toggleRoleTool } from "./role-overrides";
import { applyPermissionChange } from "@/lib/server/permissions";
import { connectorFields } from "@/lib/server/tools/registry";

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

describe("defaultOf and removeOverride", () => {
  test("an override knows the value it replaced, and removing it puts the role back on that value", () => {
    setRoleTool("sales_rep", "list_courses", false, ADMIN);
    const entry = overrideFor("sales_rep", "tool", "list_courses");
    if (!entry) throw new Error("override was not written");
    expect(defaultOf(entry)).toBe(true);
    expect(removeOverride(entry.id)).toBe(true);
    expect(permissionsFor("sales_rep").toolAllow).toContain("list_courses");
  });
});

describe("nobody widens their own access", () => {
  test("an administrator cannot unmask a metric for their own role, by chat or by the admin page", () => {
    expect(permissionsFor("it_admin").metricAcl.headcount).toBe("masked");
    const viaChat = applyPermissionChange({ role: "it_admin", kind: "metric", key: "headcount", value: "full" }, ADMIN);
    expect(viaChat.ok).toBe(false);
    expect(setMetricVisibility("it_admin", "headcount", "full", ADMIN)).toBe("masked");
    expect(cycleMetricVisibility("it_admin", "headcount", ADMIN)).toBe("none");
    expect(cycleMetricVisibility("it_admin", "headcount", ADMIN)).toBe("none");
    expect(live(ADMIN).metricAcl.headcount).toBe("none");
  });

  test("the same administrator still changes other roles, and may narrow their own", () => {
    expect(applyPermissionChange({ role: "sales_rep", kind: "metric", key: "ar_overdue", value: "full" }, ADMIN).ok).toBe(true);
    expect(live("u_krit").metricAcl.ar_overdue).toBe("full");
    expect(applyPermissionChange({ role: "it_admin", kind: "metric", key: "headcount", value: "none" }, ADMIN).ok).toBe(true);
    expect(applyPermissionChange({ role: "it_admin", kind: "metric", key: "headcount", value: "masked" }, ADMIN).ok).toBe(true);
    expect(applyPermissionChange({ role: "it_admin", kind: "metric", key: "headcount", value: "full" }, ADMIN).ok).toBe(false);
  });

  test("an administrator cannot hand their own role a tool or a hidden connector field", () => {
    const missing = permissionsFor("it_admin").toolAllow;
    const field = connectorFields().find((entry) => entry.defaultFor("it_admin") !== "full");
    if (field) expect(setFieldVisibility("it_admin", field.key, "full", ADMIN)).toBe(field.defaultFor("it_admin"));
    const otherTool = (["request_leave", "enroll_course"] as const).find((tool) => !missing.includes(tool));
    if (otherTool) expect(setRoleTool("it_admin", otherTool, true, ADMIN)).toBe(false);
  });
});
