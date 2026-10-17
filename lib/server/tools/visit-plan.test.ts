import { afterEach, describe, expect, test } from "bun:test";
import { accessFor } from "@/lib/access/policies";
import type { Alert } from "@/lib/contracts";
import { DATA_AS_OF, addDays } from "@/lib/data/dates";
import { agentsOwnedBy } from "@/lib/data/entities/agents";
import { findUser } from "@/lib/data/entities/users";
import { alerts } from "@/lib/server/agent/collections";
import { winyuTools } from "@/lib/server/agent/tools";
import { runWithAccess } from "@/lib/server/request-context";

const REP = "u_krit";
const ALERT_ID = "al_test_visit_plan";

type VisitRow = { order: number; agent_name: string; reason: string; sales_change_pct: number | null; sales_change_label: string; sales_basis: string; alert_label: string | null };
type VisitPlan = { ok: true; summary: string; rows: VisitRow[]; metrics: { label: string; value: string; detail: string | null }[] };

async function planFor(userId: string): Promise<VisitPlan> {
  const user = findUser(userId);
  if (!user) throw new Error(`no ${userId}`);
  return runWithAccess(accessFor(user), () => winyuTools().visit_plan.execute({ limit: null }) as Promise<VisitPlan>);
}

afterEach(() => alerts().remove(ALERT_ID));

describe("visit_plan shows the numbers its order rests on (AI-182)", () => {
  test("every agent the rep owns is ranked with its sell-in change and the basis of that change", async () => {
    const plan = await planFor(REP);
    const owned = agentsOwnedBy(REP);
    expect(plan.rows).toHaveLength(owned.length);
    for (const row of plan.rows) {
      expect(row.sales_basis).toContain("28 วัน");
      if (row.sales_change_pct !== null) expect(row.sales_change_label).toMatch(/^[+−-]?\d+(\.\d)?% · 28 วัน$/);
    }
  });

  test("an agent with an open alert leads, and the alert's figure is labelled with its own window and basis, not as the 4-week change", async () => {
    const [agent] = agentsOwnedBy(REP);
    const alert: Alert = {
      id: ALERT_ID, at: `${DATA_AS_OF}T06:00:00.000Z`, severity: "P1", metric: "net_sales_volume", dims: { agent: agent.id, region: "northeast" }, window: { from: addDays(DATA_AS_OF, -12), to: DATA_AS_OF },
      observed: 1784.7, expected: 16478.2, zScore: -29, direction: "down", hypothesis: "test", verifySteps: [{ text: "a", metrics: ["net_sales_volume"] }, { text: "b", metrics: ["ar_overdue"] }],
      ownerUserId: "u_anucha", status: "open", dismissCount: 0, parentId: null, relatedIds: [], campaignId: null, alsoOwnerIds: [], brands: ["leo", "singha"],
    };
    alerts().put(alert);
    const plan = await planFor(REP);
    const alerted = plan.rows.find((row) => row.agent_name === agent.nameTh);
    expect(alerted?.alert_label).toContain("−89%");
    expect(alerted?.alert_label).toContain("ลีโอ");
    expect(alerted?.alert_label).toContain("เทียบระดับปกติ");
    expect(alerted?.alert_label).toContain("พ.ย.");
    const quiet = plan.rows.findIndex((row) => row.alert_label === null);
    expect(plan.rows.findIndex((row) => row.agent_name === agent.nameTh)).toBeLessThan(quiet === -1 ? plan.rows.length : quiet);
    expect(plan.metrics[0]).toMatchObject({ value: plan.rows[0].agent_name, label: "ควรไปก่อน" });
  });

  test("the reason a card shows for an alerted agent names the brands and the days the drop covers, so it never reads as the whole agent falling (AI-212)", async () => {
    const [agent] = agentsOwnedBy(REP);
    alerts().put({
      id: ALERT_ID, at: `${DATA_AS_OF}T06:00:00.000Z`, severity: "P1", metric: "net_sales_volume", dims: { agent: agent.id, region: "northeast" }, window: { from: addDays(DATA_AS_OF, -12), to: DATA_AS_OF },
      observed: 1784.7, expected: 16478.2, zScore: -29, direction: "down", hypothesis: "test", verifySteps: [{ text: "a", metrics: ["net_sales_volume"] }, { text: "b", metrics: ["ar_overdue"] }], ownerUserId: "u_anucha", status: "open", dismissCount: 0, parentId: null, relatedIds: [], campaignId: null, alsoOwnerIds: [], brands: ["leo", "singha"],
    });
    const plan = await planFor(REP);
    const alerted = plan.rows.find((row) => row.agent_name === agent.nameTh);
    expect(alerted?.reason).toContain("ลีโอ");
    expect(alerted?.reason).toContain("พ.ย.");
    expect(plan.metrics[0].detail).toBe(plan.rows[0].reason);
  });
});
