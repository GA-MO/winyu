import { describe, expect, test } from "bun:test";
import type { AccessContext, MetricQuery, NextActionContext, ResolvedQuery } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { GENERATOR_DICTIONARY } from "@/lib/data/master";
import { runMetric } from "@/lib/data/query";
import { regionOfSlice } from "@/lib/semantic/geo";
import { effectiveFilters, pinnedSlice } from "@/lib/semantic/resolved";
import { responsibleFor } from "@/lib/access/raci";
import { nextActionsFor } from "./next-actions";

const CEO = "u_thana";
const RSM_NORTHEAST = "u_anucha";
const NO_FOCUS = { slice: null, row: null, subject: null };

function accessOf(userId: string): AccessContext {
  const user = findUser(userId);
  if (!user) throw new Error(`no user ${userId}`);
  return accessFor(user);
}

function resolvedFor(query: MetricQuery, asUser = CEO): ResolvedQuery {
  const result = runMetric(query, accessOf(asUser));
  if (!result.ok) throw new Error(result.error);
  return result.query;
}

function queryOf(metric: MetricQuery["metric"], region?: string, asUser = CEO): ResolvedQuery {
  return resolvedFor({
    metric,
    dims: ["agent"],
    filters: region ? { region: [region] } : {},
    range: { from: "2026-09-01", to: "2026-09-22" },
    grain: "month",
    compare: "prev_period",
    limit: 10,
  }, asUser);
}

function regionOf(query: ResolvedQuery): NextActionContext["region"] {
  return regionOfSlice(GENERATOR_DICTIONARY, pinnedSlice(effectiveFilters(query)));
}

function contextOf(overrides: Partial<NextActionContext> = {}): NextActionContext {
  const query = overrides.query ?? queryOf("net_sales_volume");
  return {
    query,
    focus: { slice: null, row: "ภาคอีสาน", subject: "ภาคอีสาน" },
    deltaPercent: null,
    masked: [],
    alertIds: [],
    verifyStep: null,
    region: regionOf(query),
    ...overrides,
  };
}

function idsOf(actions: { id: string }[]): string[] {
  return actions.map((action) => action.id);
}

describe("nextActionsFor", () => {
  test("a healthy number offers a drill-in, never a send", () => {
    const actions = nextActionsFor(accessOf(CEO), contextOf({ deltaPercent: 1.2 }));
    expect(idsOf(actions)).toEqual(["drill-why"]);
  });

  test("a bad drop offers the person accountable for that metric and region", () => {
    const actions = nextActionsFor(accessOf(CEO), contextOf({ deltaPercent: -12, query: queryOf("net_sales_volume", "northeast") }));
    const send = actions.find((action) => action.id === "send");
    expect(send?.tool).toBe("send_card");
    expect((send?.input as { to: string[] }).to).toEqual([RSM_NORTHEAST]);
    expect((send?.input as { card: { reads: { tool: string }[] } }).card.reads.map((read) => read.tool)).toEqual(["query_metric"]);
  });

  test("never offers to send work to yourself", () => {
    const actions = nextActionsFor(accessOf(RSM_NORTHEAST), contextOf({ deltaPercent: -12, query: queryOf("net_sales_volume", "northeast") }));
    expect(idsOf(actions)).not.toContain("send");
  });

  test("masked fields offer a request to the metric owner", () => {
    const actions = nextActionsFor(accessOf("u_siriporn"), contextOf({ masked: ["value"], query: resolvedFor({ ...queryOf("net_sales_volume"), metric: "avg_salary", dims: ["department"] }, "u_siriporn") }));
    const request = actions.find((action) => action.id === "request-access");
    expect(request?.tool).toBe("send_email");
    expect((request?.input as { toUserId: string }).toUserId).toBe("u_may");
  });

  test("an open alert offers its first verify step as a question", () => {
    const actions = nextActionsFor(accessOf(CEO), contextOf({ alertIds: ["a1"], verifyStep: "ดูประวัติการสั่งซื้อรายวัน" }));
    const verify = actions.find((action) => action.id === "verify");
    expect(verify?.tool).toBeNull();
    expect(verify?.prompt).toBe("ดูประวัติการสั่งซื้อรายวัน");
  });

  test("a repeated question offers to pin the card", () => {
    const actions = nextActionsFor(accessOf(CEO), contextOf(), 3);
    expect(idsOf(actions)).toContain("pin");
  });

  test("a role without a tool never sees the button for it", () => {
    const rep = accessOf("u_krit");
    const withoutSending = { ...rep, toolAllow: rep.toolAllow.filter((tool) => tool !== "send_card") };
    expect(idsOf(nextActionsFor(rep, contextOf({ deltaPercent: -20, query: queryOf("net_sales_volume", "northeast") })))).toContain("send");
    expect(idsOf(nextActionsFor(withoutSending, contextOf({ deltaPercent: -20, query: queryOf("net_sales_volume", "northeast") })))).not.toContain("send");
  });

  test("never offers more than three", () => {
    const actions = nextActionsFor(accessOf("u_siriporn"), contextOf({ deltaPercent: -20, masked: ["value"], alertIds: ["a1"], verifyStep: "ตรวจ", query: queryOf("ar_overdue", "northeast", "u_siriporn") }), 5);
    expect(actions.length).toBeLessThanOrEqual(3);
  });

  test("overdue money falling is good news and asks nobody to act", () => {
    const actions = nextActionsFor(accessOf(CEO), contextOf({ deltaPercent: -22.6, query: queryOf("ar_overdue") }));
    expect(idsOf(actions)).not.toContain("send");
  });

  test("overdue money rising is bad news and goes to its owner", () => {
    const actions = nextActionsFor(accessOf(CEO), contextOf({ deltaPercent: 13.5, query: queryOf("ar_overdue", "south") }));
    expect(idsOf(actions)).toContain("send");
  });

  test("a province never offers a split by region, it offers the next finer level", () => {
    const query = resolvedFor({ ...queryOf("ar_overdue"), dims: ["month"], filters: { province: ["pv_songkhla"] } });
    const actions = nextActionsFor(accessOf(CEO), contextOf({ query, focus: NO_FOCUS }));
    expect(idsOf(actions)).not.toContain("drill-region");
    expect(idsOf(actions)).toContain("drill-agent");
  });

  test("a province hands work to the owner of its region", () => {
    const query = resolvedFor({ ...queryOf("net_sales_volume"), filters: { province: ["pv_khonkaen"] } });
    const send = nextActionsFor(accessOf(CEO), contextOf({ deltaPercent: -12, query })).find((action) => action.id === "send");
    expect((send?.input as { to: string[] }).to).toEqual([RSM_NORTHEAST]);
  });

  test("an alert's verify step replaces the why question instead of repeating it", () => {
    const actions = nextActionsFor(accessOf(CEO), contextOf({ deltaPercent: -12, alertIds: ["a1"], focus: { slice: null, row: null, subject: "ภาคใต้" }, verifyStep: "ดูเอเย่นต์ที่ค้างนานสุด" }));
    expect(idsOf(actions)).toContain("verify");
    expect(idsOf(actions)).not.toContain("drill-why");
  });

  test("someone who sees one region is never offered a split by region", () => {
    const query = resolvedFor({ ...queryOf("sell_out_volume"), dims: ["sku"] }, "u_krit");
    const actions = nextActionsFor(accessOf("u_krit"), contextOf({ query, focus: NO_FOCUS }));
    expect(idsOf(actions)).not.toContain("drill-region");
    expect(idsOf(actions)).toContain("drill-province");
  });

  test("a masked answer offers no drill into numbers nobody can read", () => {
    const actions = nextActionsFor(accessOf("u_ton"), contextOf({ masked: ["value"], query: resolvedFor({ ...queryOf("net_sales_volume"), metric: "forecast_mape", dims: ["month"] }, "u_ton"), focus: NO_FOCUS }));
    expect(idsOf(actions).some((id) => id.startsWith("drill"))).toBe(false);
  });

  test("overdue debt on one agent is handed to the rep assigned to it; the same debt by region stays with finance", () => {
    const handoffTo = (filters: MetricQuery["filters"]) => {
      const query = resolvedFor({ metric: "ar_overdue", dims: ["agent"], filters, range: { from: "2026-09-01", to: "2026-09-22" }, grain: "month", compare: "prev_period", limit: 10 });
      const send = nextActionsFor(accessOf(CEO), contextOf({ deltaPercent: 12, query, region: regionOf(query) })).find((action) => action.id === "send");
      return (send?.input as { to: string[] } | undefined)?.to[0];
    };
    expect(handoffTo({ agent: ["ag_sou_06"] })).toBe("u_arm");
    expect(handoffTo({ region: ["south"] })).toBe("u_mint");
  });
});

describe("responsibleFor", () => {
  test("an agent's overdue debt goes to its assigned rep; its sales and margin keep their RACI owner", () => {
    expect(responsibleFor("ar_overdue", "south", "ag_sou_06")?.userId).toBe("u_arm");
    expect(responsibleFor("net_sales_volume", "south", "ag_sou_06")?.role).toBe("sales_rsm");
    expect(responsibleFor("ar_overdue", "south")?.userId).toBe("u_mint");
    expect(responsibleFor("gross_margin", "south", "ag_sou_06")?.role).toBe("finance_analyst");
  });
});
