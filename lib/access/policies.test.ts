import { describe, expect, test } from "bun:test";
import { METRIC_IDS, ROLE_IDS, TOOL_SURFACE } from "@/lib/contracts";
import { USERS, findUser } from "@/lib/data/entities/users";
import { ROLE_POLICIES, accessFor } from "./policies";

describe("role policies", () => {
  test("every role has an entry covering every metric", () => {
    for (const role of ROLE_IDS) {
      const policy = ROLE_POLICIES[role];
      expect(policy).toBeDefined();
      for (const metric of METRIC_IDS) expect(policy.metricAcl[metric]).toBeDefined();
    }
  });

  test("avg_salary is masked or hidden for everyone except hr_manager and ceo", () => {
    for (const role of ROLE_IDS) {
      const visibility = ROLE_POLICIES[role].metricAcl.avg_salary;
      if (role === "hr_manager" || role === "ceo") expect(visibility).toBe("full");
      else expect(visibility).not.toBe("full");
    }
    expect(ROLE_POLICIES.sales_rep.metricAcl.avg_salary).not.toBe("full");
  });

  test("tool allow lists follow the tool surface", () => {
    expect(ROLE_POLICIES.sales_rep.toolAllow).not.toContain("create_handoff");
    expect(ROLE_POLICIES.sales_rep.toolAllow).not.toContain("send_email");
    expect(ROLE_POLICIES.it_admin.toolAllow).toContain("run_job");
    expect(ROLE_POLICIES.ceo.toolAllow).not.toContain("run_job");
    expect(ROLE_POLICIES.ceo.toolAllow).not.toContain("set_permission");
    expect(ROLE_POLICIES.ceo.toolAllow.length).toBe(TOOL_SURFACE.filter((entry) => entry.tier !== "destructive").length);
  });

  test("RSM scope is the own region, CEO scope is all", () => {
    const anucha = findUser("u_anucha");
    expect(anucha).not.toBeNull();
    expect(accessFor(anucha!).regions).toEqual(["northeast"]);
    expect(accessFor(findUser("u_thana")!).regions).toBe("all");
  });

  test("every role has at least one user", () => {
    for (const role of ROLE_IDS) expect(USERS.some((candidate) => candidate.role === role)).toBe(true);
    expect(USERS.length).toBeGreaterThanOrEqual(26);
  });
});
