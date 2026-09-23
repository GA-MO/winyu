import { describe, expect, test } from "bun:test";
import type { AccessContext, MetricQuery, NextActionContext } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { nextActionsFor } from "./next-actions";

const CEO = "u_thana";
const RSM_NORTHEAST = "u_anucha";

function accessOf(userId: string): AccessContext {
  const user = findUser(userId);
  if (!user) throw new Error(`no user ${userId}`);
  return accessFor(user);
}

function queryOf(metric: MetricQuery["metric"], region?: string): MetricQuery {
  return {
    metric,
    dims: ["agent"],
    filters: region ? { region: [region] } : {},
    range: { from: "2026-09-01", to: "2026-09-22" },
    grain: "month",
    compare: "prev_period",
    limit: 10,
  };
}

function contextOf(overrides: Partial<NextActionContext> = {}): NextActionContext {
  return {
    title: "ยอดขาย",
    query: queryOf("net_sales_volume"),
    deltaPercent: null,
    masked: [],
    topLabel: "ภาคอีสาน",
    alertIds: [],
    alertScope: null,
    verifyStep: null,
    ...overrides,
  };
}

function idsOf(actions: { id: string }[]): string[] {
  return actions.map((action) => action.id);
}

describe("nextActionsFor", () => {
  test("a healthy number offers a drill-in, never a handoff", () => {
    const actions = nextActionsFor(accessOf(CEO), contextOf({ deltaPercent: 1.2 }));
    expect(idsOf(actions)).toEqual(["drill-why"]);
  });

  test("a bad drop offers the person accountable for that metric and region", () => {
    const actions = nextActionsFor(accessOf(CEO), contextOf({ deltaPercent: -12, query: queryOf("net_sales_volume", "northeast") }));
    const handoff = actions.find((action) => action.id === "handoff");
    expect(handoff?.tool).toBe("create_handoff");
    expect((handoff?.input as { toUserId: string }).toUserId).toBe(RSM_NORTHEAST);
  });

  test("never offers to hand work to yourself", () => {
    const actions = nextActionsFor(accessOf(RSM_NORTHEAST), contextOf({ deltaPercent: -12, query: queryOf("net_sales_volume", "northeast") }));
    expect(idsOf(actions)).not.toContain("handoff");
  });

  test("masked fields offer a request to the metric owner", () => {
    const actions = nextActionsFor(accessOf("u_siriporn"), contextOf({ masked: ["value"], query: queryOf("avg_salary") }));
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
    expect(rep.toolAllow).not.toContain("create_handoff");
    const actions = nextActionsFor(rep, contextOf({ deltaPercent: -20, query: queryOf("net_sales_volume", "northeast") }));
    expect(idsOf(actions)).not.toContain("handoff");
  });

  test("never offers more than three", () => {
    const actions = nextActionsFor(accessOf("u_siriporn"), contextOf({ deltaPercent: -20, masked: ["value"], alertIds: ["a1"], verifyStep: "ตรวจ", query: queryOf("ar_overdue", "northeast") }), 5);
    expect(actions.length).toBeLessThanOrEqual(3);
  });
});
