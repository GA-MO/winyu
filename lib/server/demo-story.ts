import type { Alert } from "@/lib/contracts";
import { thresholdKey } from "@/lib/engine/anomaly";
import { alertOutcomes, alerts } from "./agent/collections";
import { runEngineJobs } from "./alerts";

const STORY_AGENT = "ag_nea_05";
const RECIPIENT_ID = "u_krit";
const PAST_OUTCOME_ID = "demo_outcome_ubon_credit";
const PAST_ALERT_ID = "demo_alert_ubon_june";
const PAST_OUTCOME_AT = "2026-06-12T09:00:00.000Z";
const PAST_OUTCOME = "ติดวงเงินเครดิต ขยายวงเงินแล้วยอดกลับใน 2 สัปดาห์";

export type DemoStory = { alertId: string; outcomeId: string; created: { outcome: boolean } };

function storyAlert(): Alert | null {
  return (
    alerts()
      .all()
      .find((alert) => alert.metric === "net_sales_volume" && alert.direction === "down" && alert.dims.agent === STORY_AGENT && !alert.dims.brand && !alert.dims.sku) ?? null
  );
}

async function findOrRunEngine(): Promise<Alert | null> {
  const found = storyAlert();
  if (found) return found;
  await runEngineJobs();
  return storyAlert();
}

function ensurePastOutcome(alert: Alert): boolean {
  if (alertOutcomes().get(PAST_OUTCOME_ID)) return false;
  alertOutcomes().put({
    id: PAST_OUTCOME_ID,
    key: thresholdKey(alert.metric, alert.dims),
    alertId: PAST_ALERT_ID,
    verdict: "real",
    outcome: PAST_OUTCOME,
    byUserId: RECIPIENT_ID,
    at: PAST_OUTCOME_AT,
  });
  return true;
}

/** Makes sure the demo story is there to find: the northeast agent's alert and the lesson from last time it happened; it sends nobody anything, so the demo's first matter is the one the presenter sends; safe to run again. */
export async function ensureDemoStory(): Promise<DemoStory | null> {
  const alert = await findOrRunEngine();
  if (!alert) return null;
  return { alertId: alert.id, outcomeId: PAST_OUTCOME_ID, created: { outcome: ensurePastOutcome(alert) } };
}
