import type { Alert } from "@/lib/contracts";
import { thresholdKey } from "@/lib/engine/anomaly";
import { addDays, DATA_AS_OF } from "@/lib/data/dates";
import { findUser } from "@/lib/data/entities/users";
import type { Matter } from "@/lib/share/matter";
import { alertOutcomes, alerts } from "./agent/collections";
import { runEngineJobs } from "./alerts";
import { createShare } from "./share/deliver";
import { shares } from "./share/shares";
import { handoffEnabled } from "@/lib/access/enforce";

const STORY_AGENT = "ag_nea_05";
const SENDER_ID = "u_anucha";
const RECIPIENT_ID = "u_krit";
const PAST_OUTCOME_ID = "demo_outcome_ubon_credit";
const PAST_ALERT_ID = "demo_alert_ubon_june";
const PAST_OUTCOME_AT = "2026-06-12T09:00:00.000Z";
const PAST_OUTCOME = "ติดวงเงินเครดิต ขยายวงเงินแล้วยอดกลับใน 2 สัปดาห์";
const LOOKBACK_DAYS = 27;

export type DemoStory = { alertId: string; matterCode: string | null; outcomeId: string; created: { matter: boolean; outcome: boolean } };

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

function openStoryMatter(alertId: string): Matter | null {
  return shares().all().find((matter) => matter.senderId === SENDER_ID && matter.status === "open" && matter.alertIds.includes(alertId)) ?? null;
}

const STORY_QUERY = { metric: "net_sales_volume", dims: ["brand"], filters: { agent: [STORY_AGENT] }, grain: "week", compare: "prev_period", limit: null } as const;
const STORY_ASK = "ช่วยแวะอุบลศรีสุขสัปดาห์นี้ เช็กว่าติดวงเงินเครดิตเหมือนเดือนมิถุนายนหรือเปลี่ยนไปรับของเจ้าอื่น แล้วปิดเรื่องพร้อมบอกว่าเป็นเรื่องจริงไหม";

async function sendStoryMatter(alert: Alert): Promise<Matter> {
  const sender = findUser(SENDER_ID);
  if (!sender || !findUser(RECIPIENT_ID)) throw new Error(`demo story: missing ${SENDER_ID} or ${RECIPIENT_ID}`);
  const input = { ...STORY_QUERY, range: { from: addDays(DATA_AS_OF, -LOOKBACK_DAYS), to: DATA_AS_OF } };
  const outcome = await createShare(sender, {
    card: { kind: "tool", reads: [{ tool: "query_metric", input }] },
    question: null,
    ask: STORY_ASK,
    intent: "act",
    urgency: "now",
    recipients: [{ userId: RECIPIENT_ID, channel: "winyu" }],
    alertIds: [alert.id],
  });
  if (!outcome.ok) throw new Error(`demo story: ${outcome.error}`);
  return outcome.share;
}

/** Adds the one matter the demo needs to show closing with a verdict and the lesson from last time: the northeast RSM asks the Khon Kaen rep about the agent whose orders stopped; safe to run again. */
export async function ensureDemoStory(): Promise<DemoStory | null> {
  const alert = await findOrRunEngine();
  if (!alert) return null;
  const outcomeCreated = ensurePastOutcome(alert);
  const existing = openStoryMatter(alert.id);
  const matter = existing ?? (handoffEnabled() ? await sendStoryMatter(alert) : null);
  return { alertId: alert.id, matterCode: matter?.id ?? null, outcomeId: PAST_OUTCOME_ID, created: { matter: !existing && matter !== null, outcome: outcomeCreated } };
}
