import { afterEach, describe, expect, test } from "bun:test";
import { accessFor } from "@/lib/access/policies";
import type { AccessContext, Alert, AlertRow, MetricId } from "@/lib/contracts";
import { DATA_AS_OF, addDays } from "@/lib/data/dates";
import { findUser } from "@/lib/data/entities/users";
import { alerts } from "@/lib/server/agent/collections";
import { winyuTools } from "@/lib/server/agent/tools";
import { runWithAccess, runWithTurn } from "@/lib/server/request-context";

const CEO = "u_thana";
const RSM_NORTHEAST = "u_anucha";
const STOPPED_AGENT = "ag_nea_02";
const STOPPED_AGENT_NAME = "อีสานรุ่งโรจน์ ค้าส่ง";
const PLACED: string[] = [];

type AlertsAnswer = { ok: boolean; summary: string; rows: AlertRow[] };

function accessOf(userId: string): AccessContext {
  const user = findUser(userId);
  if (!user) throw new Error(`no user ${userId}`);
  return accessFor(user);
}

function placed(id: string, metric: MetricId, dims: Alert["dims"], severity: Alert["severity"] = "P1"): Alert {
  const alert: Alert = {
    id, at: `${DATA_AS_OF}T06:00:00.000Z`, severity, metric, dims, window: { from: addDays(DATA_AS_OF, -12), to: DATA_AS_OF },
    observed: 10, expected: 100, zScore: -9, direction: metric === "ar_overdue" ? "up" : "down", hypothesis: "test", verifySteps: [{ text: "a", metrics: [metric] }, { text: "b", metrics: [metric] }],
    ownerUserId: RSM_NORTHEAST, status: "open", dismissCount: 0, parentId: null, relatedIds: [], campaignId: null, alsoOwnerIds: [],
  };
  alerts().put(alert);
  PLACED.push(id);
  return alert;
}

async function alertsFor(userId: string, input: Record<string, unknown>, question: string | null = null): Promise<AlertsAnswer> {
  const turn = { turnId: null, threadId: null, question, queries: [] };
  return runWithAccess(accessOf(userId), () => runWithTurn(turn, () => winyuTools().get_alerts.execute({ status: "open", limit: 60, ...input }) as Promise<AlertsAnswer>));
}

afterEach(() => {
  for (const id of PLACED.splice(0)) alerts().remove(id);
});

describe("get_alerts matches the measure the question is on, not one metric id", () => {
  test("a sell-in question in baht finds the agent's open sell-in alert counted in litres", async () => {
    const stopped = placed("al_test_orders_stopped", "net_sales_volume", { agent: STOPPED_AGENT, region: "northeast" });
    const answer = await alertsFor(RSM_NORTHEAST, { metric: "net_sales_value", dims: { agent: STOPPED_AGENT_NAME } });
    expect(answer.rows.map((row) => row.id)).toContain(stopped.id);
  });

  test("a stock question still leaves the sell-in alert out", async () => {
    const stopped = placed("al_test_orders_stopped", "net_sales_volume", { agent: STOPPED_AGENT, region: "northeast" });
    const answer = await alertsFor(RSM_NORTHEAST, { metric: "days_of_cover", dims: { agent: STOPPED_AGENT_NAME } });
    expect(answer.rows.map((row) => row.id)).not.toContain(stopped.id);
  });
});
