import { afterAll, describe, expect, test } from "bun:test";
import type { Alert } from "@/lib/contracts";
import type { HopState, Matter } from "@/lib/share/matter";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { thresholdKey } from "@/lib/engine/anomaly";
import { alertOutcomes, alertThresholds, alerts } from "@/lib/server/agent/collections";
import { shares } from "@/lib/server/share/shares";
import { openAlertsFor } from "./alerts";
import { suggestOwner, usualRecipient } from "./share/owner";
import { lessonFor, recordOutcome } from "./outcomes";

const RSM = accessFor(findUser("u_anucha") ?? (() => { throw new Error("missing u_anucha"); })());
const saved = { alerts: new Map<string, Alert>(), outcomes: [] as string[], matters: [] as string[], thresholds: new Map<string, number | null>() };

function take(alert: Alert): Alert {
  saved.alerts.set(alert.id, alert);
  const key = thresholdKey(alert.metric, alert.dims);
  if (!saved.thresholds.has(key)) saved.thresholds.set(key, alertThresholds().get(key)?.dismissals ?? null);
  return alert;
}

function matterFor(alert: Alert, toUserId: string, state: HopState = "sent"): Matter {
  const at = "2026-09-22T00:00:00.000Z";
  const input = { metric: alert.metric, dims: [], filters: { region: ["northeast"] }, range: { from: "2026-09-01", to: "2026-09-22" }, grain: "month", compare: "none", limit: null };
  const matter: Matter = {
    id: `testMatter${saved.matters.length}`, at, updatedAt: at, senderId: RSM.userId, title: "t", question: null, ask: "a", intent: "act", urgency: "today", goal: null, alertIds: [alert.id],
    path: [{ userId: toUserId, fromUserId: RSM.userId, at, state }], thread: [], status: "open", card: { kind: "tool", reads: [{ tool: "query_metric", input }] },
    deliveries: [{ userId: toUserId, asked: "winyu", via: "winyu", fallback: null }], openedBy: [], lastViewedAt: null,
  };
  saved.matters.push(matter.id);
  return shares().put(matter);
}

afterAll(() => {
  for (const alert of saved.alerts.values()) alerts().put(alert);
  for (const entry of alertOutcomes().where((outcome) => saved.alerts.has(outcome.alertId))) alertOutcomes().remove(entry.id);
  for (const id of saved.matters) shares().remove(id);
  for (const [key, dismissals] of saved.thresholds) {
    if (dismissals === null) alertThresholds().remove(key);
    else alertThresholds().put({ id: key, dismissals, updatedAt: new Date().toISOString() });
  }
});

describe("closing a matter about an alert teaches the next alert", () => {
  test("real resolves the alert and leaves a lesson on its slice", () => {
    const alert = take(openAlertsFor(RSM)[0] as Alert);
    recordOutcome(matterFor(alert, "u_pim").alertIds, "u_pim", "real", "เอเย่นต์ติดเครดิต ขยายวงเงินแล้ว");
    expect(alerts().get(alert.id)?.status).toBe("resolved");
    const lesson = lessonFor(alerts().get(alert.id) as Alert);
    expect(lesson).toContain("เป็นเรื่องจริง");
    expect(lesson).toContain("ขยายวงเงิน");
    expect(lesson?.startsWith("เคสเก่า ")).toBe(true);
    expect(lesson).toContain("คุณพิม สุริยวงศ์ ปิดไว้ว่าเป็นเรื่องจริง");
  });

  test("noise closes it for everyone", () => {
    const alert = take(openAlertsFor(RSM)[0] as Alert);
    recordOutcome(matterFor(alert, "u_pim").alertIds, "u_pim", "noise", "ย้ายคลังชั่วคราว ไม่ใช่ยอดตกจริง");
    expect(alerts().get(alert.id)?.status).toBe("dismissed");
    expect(lessonFor(alert)).toContain("ไม่ใช่ปัญหา");
  });
});

describe("who a matter goes to", () => {
  test("the colleague the user keeps sending a metric to comes before the RACI owner", () => {
    const alert = take(openAlertsFor(RSM).find((entry) => entry.metric === "net_sales_volume") as Alert);
    expect(suggestOwner("net_sales_volume", "northeast", RSM.userId)?.userId).not.toBe("u_ben");
    matterFor(alert, "u_ben", "sent");
    matterFor(alert, "u_ben", "seen");
    expect(usualRecipient(RSM.userId, "net_sales_volume", "northeast")?.userId).not.toBe("u_ben");
    matterFor(alert, "u_ben", "accepted");
    matterFor(alert, "u_ben", "accepted");
    expect(usualRecipient(RSM.userId, "net_sales_volume", "northeast")?.userId).toBe("u_ben");
    expect(suggestOwner("net_sales_volume", "northeast", RSM.userId)?.userId).toBe("u_ben");
    expect(usualRecipient(RSM.userId, "net_sales_volume", "north")).toBeNull();
  });

  test("a matter passed on does not count for the one who passed it", () => {
    const alert = take(openAlertsFor(RSM).find((entry) => entry.metric === "net_sales_volume") as Alert);
    const before = usualRecipient(RSM.userId, "sell_out_volume", "northeast");
    matterFor({ ...alert, metric: "sell_out_volume" }, "u_fah", "passed_on");
    matterFor({ ...alert, metric: "sell_out_volume" }, "u_fah", "passed_on");
    expect(usualRecipient(RSM.userId, "sell_out_volume", "northeast")).toEqual(before);
  });
});
