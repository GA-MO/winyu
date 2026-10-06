import { describe, expect, test } from "bun:test";
import type { AccessContext, ActiveGrant, GrantSlice, MetricId } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { DEFAULT_GRANT_AUTHORITY, grantedSlice, grantRefusal, hiddenFrom, metricAccess, type GrantCheck } from "./grants";
import { accessFor } from "./policies";
import type { PolicyRule } from "./policy-rules";

const AT = new Date("2026-10-06T03:00:00Z");
const LATER = "2026-10-09T03:00:00Z";
const EARLIER = "2026-10-05T03:00:00Z";
const ALL_SALES: GrantSlice = { metric: "net_sales_value", regions: "all", brands: "all" };

function access(id: string): AccessContext {
  const user = findUser(id);
  if (!user) throw new Error(`no ${id}`);
  return accessFor(user);
}

function holding(id: string, grant: Partial<ActiveGrant> & { slice: GrantSlice }): AccessContext {
  return { ...access(id), grants: [{ id: "g1", grantorId: "u_thana", expiresAt: LATER, ...grant }] };
}

function check(grantorId: string, recipientId: string, slice: GrantSlice, overrides: Partial<GrantCheck> = {}): GrantCheck {
  const grantor = access(grantorId);
  return { grantor, authority: DEFAULT_GRANT_AUTHORITY[grantor.role] ?? [], recipient: access(recipientId), slice, days: 3, at: AT, rules: [], ...overrides };
}

function slice(metric: MetricId): GrantSlice {
  return { metric, regions: "all", brands: "all" };
}

describe("a live grant widens one metric for its holder", () => {
  test("u_krit with a CEO grant of net_sales_value in every region reads every region for that metric, and only his own region for any other", () => {
    const krit = holding("u_krit", { slice: ALL_SALES });
    const granted = metricAccess(krit, "net_sales_value", AT);
    expect(granted.access.regions).toBe("all");
    expect(granted.grant).toEqual({ id: "g1", grantorId: "u_thana", expiresAt: LATER });
    const other = metricAccess(krit, "net_sales_volume", AT);
    expect(other.access.regions).toEqual(["northeast"]);
    expect(other.grant).toBeNull();
  });

  test("a grant lifts a metric the role does not see from none to full", () => {
    const krit = holding("u_krit", { slice: slice("gross_margin") });
    expect(krit.metricAcl.gross_margin).toBe("none");
    expect(metricAccess(krit, "gross_margin", AT).access.metricAcl.gross_margin).toBe("full");
  });

  test("past its expiry a grant widens nothing", () => {
    const krit = holding("u_krit", { slice: ALL_SALES, expiresAt: EARLIER });
    const result = metricAccess(krit, "net_sales_value", AT);
    expect(result.access.regions).toEqual(["northeast"]);
    expect(result.grant).toBeNull();
  });

  test("a grant never lifts a masked metric", () => {
    const krit = holding("u_krit", { slice: slice("ar_overdue") });
    const result = metricAccess(krit, "ar_overdue", AT);
    expect(result.access.metricAcl.ar_overdue).toBe("masked");
    expect(result.access.regions).toEqual(["northeast"]);
    expect(result.grant).toBeNull();
  });

  test("a grant of one region adds it to the holder's own", () => {
    const krit = holding("u_krit", { slice: { metric: "net_sales_value", regions: ["bkk"], brands: "all" } });
    expect(metricAccess(krit, "net_sales_value", AT).access.regions).toEqual(["bkk", "northeast"]);
  });
});

describe("the slice a shared read showed", () => {
  test("a CEO read filtered to bkk grants bkk; an unfiltered one grants every region; a sales rep's read grants only his region", () => {
    const byRegion = { metric: "net_sales_value", dims: ["region"], filters: {} };
    expect(grantedSlice(access("u_thana"), { tool: "query_metric", input: { ...byRegion, filters: { region: ["bkk"] } } })).toEqual({ metric: "net_sales_value", regions: ["bkk"], brands: "all" });
    expect(grantedSlice(access("u_thana"), { tool: "query_metric", input: byRegion })).toEqual(ALL_SALES);
    expect(grantedSlice(access("u_krit"), { tool: "query_metric", input: { ...byRegion, filters: { region: ["bkk", "northeast"] } } })).toEqual({ metric: "net_sales_value", regions: ["northeast"], brands: "all" });
  });

  test("a forecast read grants its metric within its region dim; any other tool is not grantable", () => {
    expect(grantedSlice(access("u_thana"), { tool: "get_forecast", input: { metric: "stock_on_hand", dims: { region: "north" }, weeks: 4 } })).toEqual({ metric: "stock_on_hand", regions: ["north"], brands: "all" });
    expect(grantedSlice(access("u_thana"), { tool: "get_person", input: { id: "u_krit" } })).toBeNull();
  });

  test("what a slice hides from u_krit: the regions outside his own; nothing once he holds the grant", () => {
    expect(hiddenFrom(access("u_krit"), ALL_SALES, AT)).toEqual({ metric: "net_sales_value", regions: ["bkk", "central", "north", "east", "south"], brands: "all" });
    expect(hiddenFrom(access("u_krit"), { metric: "net_sales_value", regions: ["northeast"], brands: "all" }, AT)).toBeNull();
    expect(hiddenFrom(holding("u_krit", { slice: ALL_SALES }), ALL_SALES, AT)).toBeNull();
  });
});

describe("a grant never exceeds what the grantor may give", () => {
  test("the CEO may grant u_krit sales in every region", () => {
    expect(grantRefusal(check("u_thana", "u_krit", ALL_SALES))).toBeNull();
  });

  test("a sales RSM, a CFO granting sales, and a sales director granting finance are refused for authority", () => {
    expect(grantRefusal(check("u_anucha", "u_krit", ALL_SALES))).toEqual({ code: "not_authority" });
    expect(grantRefusal(check("u_siriporn", "u_krit", ALL_SALES))).toEqual({ code: "not_authority" });
    expect(grantRefusal(check("u_prasit", "u_krit", slice("gross_margin")))).toEqual({ code: "not_authority" });
  });

  test("an RSM IT gave sales authority still cannot grant regions beyond his own", () => {
    expect(grantRefusal(check("u_anucha", "u_krit", ALL_SALES, { authority: ["sales"] }))).toEqual({ code: "beyond_scope" });
  });

  test("salary, headcount and attrition are never grantable, even by the CEO", () => {
    for (const metric of ["avg_salary", "headcount", "attrition_rate"] as const) expect(grantRefusal(check("u_thana", "u_krit", slice(metric)))).toEqual({ code: "sensitive" });
  });

  test("a recipient masked on the metric is refused; so is a grant to oneself, and one that hides nothing", () => {
    expect(grantRefusal(check("u_thana", "u_krit", slice("ar_overdue")))).toEqual({ code: "masked" });
    expect(grantRefusal(check("u_thana", "u_thana", ALL_SALES))).toEqual({ code: "self" });
    expect(grantRefusal(check("u_thana", "u_krit", { metric: "net_sales_value", regions: ["northeast"], brands: "all" }))).toEqual({ code: "nothing_hidden" });
  });

  test("u_krit holding a grant cannot pass it on: his own access is what he grants from", () => {
    const krit = holding("u_krit", { slice: ALL_SALES });
    expect(grantRefusal(check("u_krit", "u_nok", ALL_SALES, { grantor: krit, authority: DEFAULT_GRANT_AUTHORITY.sales_rep ?? [] }))).toEqual({ code: "not_authority" });
    expect(grantRefusal(check("u_krit", "u_nok", ALL_SALES, { grantor: krit, authority: ["sales"] }))).toEqual({ code: "beyond_scope" });
  });

  test("a CEL rule on grant_access and the metric blocks the grant and names itself", () => {
    const rule: PolicyRule = { id: "r1", name: "ห้ามให้สิทธิ์ยอดขาย", when: 'tool.name == "grant_access" && args.metric == "net_sales_value"', enabled: true, by: "u_ton", at: EARLIER };
    expect(grantRefusal(check("u_thana", "u_krit", ALL_SALES, { rules: [rule] }))).toEqual({ code: "policy_rule", rule: { id: "r1", name: rule.name } });
    expect(grantRefusal(check("u_thana", "u_krit", slice("stock_on_hand"), { rules: [rule] }))).not.toEqual(expect.objectContaining({ code: "policy_rule" }));
  });
});
