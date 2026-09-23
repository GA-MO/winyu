import { describe, expect, test } from "bun:test";
import type { ActionEvent, Alert, ContextPacket } from "@/lib/contracts";
import { thresholdKey } from "@/lib/engine/anomaly";
import { adoptionOf, percentOf } from "./adoption";

const NOW = Date.parse("2026-10-01T09:00:00.000Z");

function alert(id: string, status: Alert["status"], region: string): Alert {
  return { id, status, metric: "net_sales_volume", dims: { region } } as unknown as Alert;
}

function event(userId: string, kind: ActionEvent["kind"], intentKey: string, daysAgo: number): ActionEvent {
  return { id: `${userId}-${intentKey}-${daysAgo}`, userId, kind, intentKey, at: new Date(NOW - daysAgo * 86_400_000).toISOString(), metric: null, dims: [], prompt: null, threadId: null };
}

const ALERTS = [alert("a1", "open", "north"), alert("a2", "dismissed", "south"), alert("a3", "open", "east"), alert("a4", "open", "bkk")];
const PACKET = { alertIds: ["a1"], status: "resolved", toUserId: "u_pim", createdAt: "2026-09-30T09:00:00.000Z", thread: [{ userId: "u_pim", at: "2026-09-30T12:00:00.000Z", text: "รับ" }] } as unknown as ContextPacket;

describe("whether Cop is used", () => {
  const summary = adoptionOf(
    {
      events: [event("u_anucha", "question", "x", 2), event("u_krit", "question", "x", 20), event("u_anucha", "alert_open", `alert:${thresholdKey("net_sales_volume", { region: "east" })}`, 1)],
      alerts: ALERTS,
      packets: [PACKET],
      widgets: [],
      watches: [],
      outbox: [],
    },
    NOW,
  );

  test("counts only people who came back this week", () => {
    const rsm = summary.activeByRole.find((entry) => entry.role === "sales_rsm");
    const rep = summary.activeByRole.find((entry) => entry.role === "sales_rep");
    expect(rsm?.active).toBe(1);
    expect(rep?.active).toBe(0);
  });

  test("sorts every alert into one fate", () => {
    expect(summary.alerts).toEqual({ total: 4, handedOff: 1, closed: 1, opened: 1, untouched: 1 });
    expect(percentOf(summary.alerts.total - summary.alerts.untouched, summary.alerts.total)).toBe(75);
  });

  test("measures how long a handoff waited for its first reply", () => {
    expect(summary.handoffs.medianHoursToReply).toBe(3);
    expect(summary.handoffs.resolved).toBe(1);
  });

  test("does not judge card use before anyone opened a dashboard", () => {
    expect(summary.cards.judged).toBe(false);
  });
});
