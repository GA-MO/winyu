import { afterEach, describe, expect, test } from "bun:test";
import { ROLE_IDS, toolRolesInclude, type RoleId } from "@/lib/contracts";
import { toolSurface } from "@/lib/server/tools/registry";
import { findUser } from "@/lib/data/entities/users";
import { accessFor } from "./policies";
import { closureOf, connectorEnabled, handoffEnabled, setConnectorEnabled, setHandoffEnabled, killTool, outOfScopeFilters, reviveTool, scopePredicates, toolsFor, assertToolAllowed, ToolNotAllowedError } from "./enforce";

function accessOf(role: RoleId) {
  const user = findUser({
    ceo: "u_thana",
    cfo: "u_siriporn",
    sales_director: "u_prasit",
    sales_rsm: "u_anucha",
    sales_rep: "u_krit",
    marketing_lead: "u_ben",
    supply_planner: "u_wee",
    finance_analyst: "u_mint",
    hr_manager: "u_may",
    it_admin: "u_ton",
  }[role]);
  if (!user) throw new Error(`no user for role ${role}`);
  return accessFor(user);
}

describe("toolsFor", () => {
  test("matches the tool surface table for every role", () => {
    for (const role of ROLE_IDS) {
      const expected = toolSurface().filter((entry) => toolRolesInclude(entry, role)).map((entry) => entry.name);
      expect(toolsFor(accessOf(role))).toEqual(expected);
    }
  });

  test("sales_rep has no write tools, only it_admin has run_job", () => {
    const rep = toolsFor(accessOf("sales_rep"));
    expect(rep).not.toContain("create_handoff");
    expect(rep).not.toContain("send_email");
    expect(rep).toContain("pin_widget");
    expect(rep).toContain("query_metric");
    expect(toolsFor(accessOf("it_admin"))).toContain("run_job");
    for (const role of ROLE_IDS.filter((candidate) => candidate !== "it_admin")) {
      expect(toolsFor(accessOf(role))).not.toContain("run_job");
    }
  });

  test("the kill switch removes a tool from every role", () => {
    killTool("get_alerts", "u_ton");
    try {
      expect(toolsFor(accessOf("ceo"))).not.toContain("get_alerts");
      expect(toolsFor(accessOf("sales_rsm"))).not.toContain("get_alerts");
    } finally {
      reviveTool("get_alerts");
    }
    expect(toolsFor(accessOf("ceo"))).toContain("get_alerts");
  });
});

describe("assertToolAllowed", () => {
  test("throws a typed error for a tool the role does not have", () => {
    expect(() => assertToolAllowed(accessOf("sales_rep"), "create_handoff")).toThrow(ToolNotAllowedError);
    expect(() => assertToolAllowed(accessOf("ceo"), "query_metric")).not.toThrow();
  });
});

describe("scopePredicates", () => {
  test("an RSM is pinned to its own region, the CEO is unrestricted", () => {
    expect(scopePredicates(accessOf("sales_rsm"))).toEqual({ region: ["northeast"] });
    expect(scopePredicates(accessOf("ceo"))).toEqual({});
  });

  test("a filter outside the scope is reported", () => {
    expect(outOfScopeFilters(accessOf("sales_rsm"), { region: ["south"] })).toEqual([
      { dim: "region", requested: ["south"], allowed: ["northeast"] },
    ]);
    expect(outOfScopeFilters(accessOf("sales_rsm"), { region: ["northeast"] })).toEqual([]);
    expect(outOfScopeFilters(accessOf("ceo"), { region: ["south"] })).toEqual([]);
  });
});

afterEach(() => {
  reviveTool("get_alerts");
});

describe("closureOf", () => {
  test("names the switch that closes a tool for everyone, and nothing when only roles decide", () => {
    const handoffWas = handoffEnabled();
    const lmsWas = connectorEnabled("lms");
    setHandoffEnabled(true, "u_ton");
    setConnectorEnabled("lms", true, "u_ton");
    expect(closureOf("get_alerts")).toBeNull();
    killTool("get_alerts", "u_ton");
    expect(closureOf("get_alerts")).toBe("killed");
    setHandoffEnabled(false, "u_ton");
    expect(closureOf("send_email")).toBe("handoff");
    setConnectorEnabled("lms", false, "u_ton");
    expect(closureOf("list_courses")).toBe("connector");
    expect(closureOf("find_people")).toBeNull();
    setHandoffEnabled(handoffWas, "u_ton");
    setConnectorEnabled("lms", lmsWas, "u_ton");
  });
});
