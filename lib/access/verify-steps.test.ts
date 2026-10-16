import { afterEach, describe, expect, test } from "bun:test";
import { accessFor } from "@/lib/access/policies";
import type { AccessContext, Alert, AlertRow } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { alerts } from "@/lib/server/agent/collections";
import { winyuTools } from "@/lib/server/agent/tools";
import { loadDictionary } from "@/lib/server/master-data";
import { actionsForAlert } from "@/lib/server/next-actions";
import { runWithAccess } from "@/lib/server/request-context";
import { verifyStepsFor } from "./verify-steps";

const REP = "u_krit";
const RSM = "u_anucha";
const ALERT_ID = "al_verify_steps_test";
const ORDERS = "ดูประวัติการสั่งซื้อรายวันของอีสานรุ่งโรจน์ 30 วันล่าสุด";
const OVERDUE = "ดูยอดค้างชำระเกินกำหนดของอีสานรุ่งโรจน์รายเดือน 6 เดือนล่าสุด";

type AlertsAnswer = { rows: (AlertRow & { verifySteps: string[] })[] };

function accessOf(userId: string): AccessContext {
  const user = findUser(userId);
  if (!user) throw new Error(`no user ${userId}`);
  return accessFor(user);
}

function silentAgentAlert(): Alert {
  return alerts().put({
    id: ALERT_ID, at: new Date().toISOString(), severity: "P1", metric: "net_sales_volume", dims: { agent: "ag_nea_02", region: "northeast" },
    window: { from: "2026-11-13", to: "2026-11-26" }, observed: 3251, expected: 13928, zScore: -9, direction: "down",
    hypothesis: "แทบไม่มีคำสั่งซื้อ", verifySteps: [{ text: ORDERS, metrics: ["net_sales_volume"] }, { text: OVERDUE, metrics: ["ar_overdue"] }],
    ownerUserId: RSM, status: "open", dismissCount: 0,
  });
}

async function alertRowFor(userId: string): Promise<AlertRow & { verifySteps: string[] }> {
  const answer = (await runWithAccess(accessOf(userId), () => winyuTools().get_alerts.execute({ status: "open", limit: 60, metric: "net_sales_volume", dims: { agent: "ag_nea_02" } }))) as AlertsAnswer;
  const row = answer.rows.find((candidate) => candidate.id === ALERT_ID);
  if (!row) throw new Error(`${userId} does not see the test alert`);
  return row;
}

afterEach(() => {
  alerts().remove(ALERT_ID);
});

describe("verify steps an alert offers", () => {
  test("a sales rep, who sees overdue AR masked, is offered only the order-history check; the regional manager gets both", async () => {
    silentAgentAlert();
    expect(accessOf(REP).metricAcl.ar_overdue).toBe("masked");
    expect((await alertRowFor(REP)).verifySteps).toEqual([ORDERS]);
    expect((await alertRowFor(RSM)).verifySteps).toEqual([ORDERS, OVERDUE]);
  });

  test("the verify button on an alert card never asks for a metric the viewer cannot read in full", async () => {
    const alert = { ...silentAgentAlert(), verifySteps: [{ text: OVERDUE, metrics: ["ar_overdue"] }, { text: ORDERS, metrics: ["net_sales_volume"] }] } satisfies Alert;
    alerts().put(alert);
    const dictionary = await loadDictionary();
    const verifyOf = (userId: string) => actionsForAlert(accessOf(userId), alert, dictionary).find((action) => action.kind === "verify")?.prompt;
    expect(verifyOf(REP)).toBe(ORDERS);
    expect(verifyOf(RSM)).toBe(OVERDUE);
  });

  test("a check stored as bare text, before checks named their metrics, is offered to no one rather than to everyone", () => {
    const legacy = { verifySteps: [ORDERS, OVERDUE] } as unknown as Pick<Alert, "verifySteps">;
    expect(verifyStepsFor(accessOf(RSM), legacy)).toEqual([]);
  });
});
