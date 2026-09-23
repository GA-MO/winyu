import { afterAll, describe, expect, test } from "bun:test";
import type { AccessContext, Alert } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { thresholdKey } from "@/lib/engine/anomaly";
import { alertMutes, alertThresholds, alerts } from "@/lib/server/agent/collections";
import { canJudge, dismissAlert, muteAlert, openAlertsFor, visibleAlert } from "./alerts";

function access(userId: string): AccessContext {
  const user = findUser(userId);
  if (!user) throw new Error(`missing demo user ${userId}`);
  return accessFor(user);
}

const RSM = access("u_anucha");
const HIS_REP = access("u_krit");
const OTHER_RSM = access("u_nattaya");
const DIRECTOR = access("u_prasit");
const CEO = access("u_thana");

const touched: { alerts: Alert[]; mutes: string[]; thresholds: Map<string, number | null> } = { alerts: [], mutes: [], thresholds: new Map() };

function remember(alert: Alert): Alert {
  touched.alerts.push(alert);
  const key = thresholdKey(alert.metric, alert.dims);
  if (!touched.thresholds.has(key)) touched.thresholds.set(key, alertThresholds().get(key)?.dismissals ?? null);
  return alert;
}

afterAll(() => {
  for (const alert of touched.alerts) alerts().put(alert);
  for (const id of touched.mutes) alertMutes().remove(id);
  for (const [key, dismissals] of touched.thresholds) {
    if (dismissals === null) alertThresholds().remove(key);
    else alertThresholds().put({ id: key, dismissals, updatedAt: new Date().toISOString() });
  }
});

function northeastAlertOf(owner: string): Alert {
  const found = openAlertsFor(RSM).find((alert) => alert.ownerUserId === owner && alert.dims.region === "northeast");
  if (!found) throw new Error(`no open northeast alert owned by ${owner}`);
  return remember(found);
}

describe("closing an alert", () => {
  test("an alert outside the caller's scope does not exist for them", () => {
    const alert = northeastAlertOf("u_anucha");
    expect(visibleAlert(alert.id, OTHER_RSM)).toBeNull();
    expect(visibleAlert(alert.id, RSM)?.id).toBe(alert.id);
  });

  test("only the owner or someone above them can close it for everyone", () => {
    const alert = northeastAlertOf("u_anucha");
    expect(canJudge(alert, RSM)).toBe(true);
    expect(canJudge(alert, DIRECTOR)).toBe(true);
    expect(canJudge(alert, CEO)).toBe(true);
    expect(canJudge(alert, HIS_REP)).toBe(false);
  });

  test("'not mine' hides the slice from that user only", () => {
    const alert = northeastAlertOf("u_anucha");
    const before = openAlertsFor(DIRECTOR).some((entry) => entry.id === alert.id);
    muteAlert(alert, HIS_REP);
    touched.mutes.push(`${HIS_REP.userId}|${thresholdKey(alert.metric, alert.dims)}`);
    expect(openAlertsFor(HIS_REP).some((entry) => entry.id === alert.id)).toBe(false);
    expect(openAlertsFor(DIRECTOR).some((entry) => entry.id === alert.id)).toBe(before);
    expect(openAlertsFor(RSM).some((entry) => entry.id === alert.id)).toBe(true);
  });

  test("'not an anomaly' closes it for everyone", () => {
    const alert = northeastAlertOf("u_anucha");
    const result = dismissAlert(alert);
    expect(result.alert.status).toBe("dismissed");
    expect(openAlertsFor(RSM).some((entry) => entry.id === alert.id)).toBe(false);
    expect(openAlertsFor(CEO).some((entry) => entry.id === alert.id)).toBe(false);
  });
});
