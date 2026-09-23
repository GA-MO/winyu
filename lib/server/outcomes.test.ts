import { afterAll, describe, expect, test } from "bun:test";
import type { Alert, ContextPacket } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { thresholdKey } from "@/lib/engine/anomaly";
import { alertOutcomes, alertThresholds, alerts, packets } from "@/lib/server/agent/collections";
import { openAlertsFor } from "./alerts";
import { suggestOwner, usualRecipient } from "./handoff";
import { lessonFor, recordOutcome } from "./outcomes";

const RSM = accessFor(findUser("u_anucha") ?? (() => { throw new Error("missing u_anucha"); })());
const saved = { alerts: new Map<string, Alert>(), outcomes: [] as string[], packets: [] as string[], thresholds: new Map<string, number | null>() };

function take(alert: Alert): Alert {
  saved.alerts.set(alert.id, alert);
  const key = thresholdKey(alert.metric, alert.dims);
  if (!saved.thresholds.has(key)) saved.thresholds.set(key, alertThresholds().get(key)?.dismissals ?? null);
  return alert;
}

function packetFor(alert: Alert, toUserId: string, status: ContextPacket["status"] = "open"): ContextPacket {
  const packet: ContextPacket = {
    id: `test-packet-${saved.packets.length}`, fromUserId: RSM.userId, toUserId, title: "t", ask: "a", urgency: "medium", sla: null,
    evidence: [{ metric: alert.metric, dims: [], filters: { region: ["northeast"] }, range: { from: "2026-09-01", to: "2026-09-22" }, grain: "month", compare: "none", limit: null }],
    alertIds: [alert.id], conversationDigest: "", suggestedActions: [], status, outcome: null, thread: [], createdAt: "2026-09-22T00:00:00.000Z", updatedAt: "2026-09-22T00:00:00.000Z",
  };
  saved.packets.push(packet.id);
  return packets().put(packet);
}

afterAll(() => {
  for (const alert of saved.alerts.values()) alerts().put(alert);
  for (const entry of alertOutcomes().where((outcome) => saved.alerts.has(outcome.alertId))) alertOutcomes().remove(entry.id);
  for (const id of saved.packets) packets().remove(id);
  for (const [key, dismissals] of saved.thresholds) {
    if (dismissals === null) alertThresholds().remove(key);
    else alertThresholds().put({ id: key, dismissals, updatedAt: new Date().toISOString() });
  }
});

describe("closing a handoff teaches the next alert", () => {
  test("real resolves the alert and leaves a lesson on its slice", () => {
    const alert = take(openAlertsFor(RSM)[0] as Alert);
    recordOutcome(packetFor(alert, "u_pim"), "u_pim", "real", "เอเย่นต์ติดเครดิต ขยายวงเงินแล้ว");
    expect(alerts().get(alert.id)?.status).toBe("resolved");
    const lesson = lessonFor(alerts().get(alert.id) as Alert);
    expect(lesson).toContain("เป็นเรื่องจริง");
    expect(lesson).toContain("ขยายวงเงิน");
  });

  test("noise closes it for everyone", () => {
    const alert = take(openAlertsFor(RSM)[0] as Alert);
    recordOutcome(packetFor(alert, "u_pim"), "u_pim", "noise", "ย้ายคลังชั่วคราว ไม่ใช่ยอดตกจริง");
    expect(alerts().get(alert.id)?.status).toBe("dismissed");
    expect(lessonFor(alert)).toContain("ไม่ใช่ปัญหา");
  });
});

describe("who a handoff goes to", () => {
  test("the colleague the user keeps sending a metric to comes before the RACI owner", () => {
    const alert = take(openAlertsFor(RSM).find((entry) => entry.metric === "net_sales_volume") as Alert);
    expect(suggestOwner("net_sales_volume", "northeast", RSM.userId)?.userId).not.toBe("u_ben");
    packetFor(alert, "u_ben", "open");
    packetFor(alert, "u_ben", "open");
    expect(usualRecipient(RSM.userId, "net_sales_volume", "northeast")?.userId).not.toBe("u_ben");
    packetFor(alert, "u_ben", "resolved");
    packetFor(alert, "u_ben", "accepted");
    packetFor(alert, "u_ben", "resolved");
    expect(usualRecipient(RSM.userId, "net_sales_volume", "northeast")?.userId).toBe("u_ben");
    expect(suggestOwner("net_sales_volume", "northeast", RSM.userId)?.userId).toBe("u_ben");
    expect(usualRecipient(RSM.userId, "net_sales_volume", "north")).toBeNull();
  });

  test("a packet sent back does not count", () => {
    const alert = take(openAlertsFor(RSM).find((entry) => entry.metric === "net_sales_volume") as Alert);
    const before = usualRecipient(RSM.userId, "sell_out_volume", "northeast");
    packetFor({ ...alert, metric: "sell_out_volume" }, "u_fah", "returned");
    packetFor({ ...alert, metric: "sell_out_volume" }, "u_fah", "returned");
    expect(usualRecipient(RSM.userId, "sell_out_volume", "northeast")).toEqual(before);
  });
});
