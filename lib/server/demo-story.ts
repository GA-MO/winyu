import type { Alert, ContextPacket } from "@/lib/contracts";
import { thresholdKey } from "@/lib/engine/anomaly";
import { addDays, TODAY } from "@/lib/data/dates";
import { findUser } from "@/lib/data/entities/users";
import { alertOutcomes, alerts, packets } from "./agent/collections";
import { runEngineJobs } from "./alerts";
import { createPacket } from "./handoff";
import { handoffEnabled } from "@/lib/access/enforce";

const STORY_AGENT = "ag_nea_05";
const SENDER_ID = "u_anucha";
const RECIPIENT_ID = "u_krit";
const PAST_OUTCOME_ID = "demo_outcome_ubon_credit";
const PAST_ALERT_ID = "demo_alert_ubon_june";
const PAST_OUTCOME_AT = "2026-06-12T09:00:00.000Z";
const PAST_OUTCOME = "ติดวงเงินเครดิต ขยายวงเงินแล้วยอดกลับใน 2 สัปดาห์";
const LOOKBACK_DAYS = 27;

export type DemoStory = { alertId: string; packetId: string | null; outcomeId: string; created: { packet: boolean; outcome: boolean } };

function storyAlert(): Alert | null {
  return (
    alerts()
      .all()
      .find((alert) => alert.metric === "net_sales_volume" && alert.direction === "down" && alert.dims.agent === STORY_AGENT && !alert.dims.brand && !alert.dims.sku) ?? null
  );
}

function findOrRunEngine(): Alert | null {
  const found = storyAlert();
  if (found) return found;
  runEngineJobs();
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

function openStoryPacket(alertId: string): ContextPacket | null {
  return packets().all().find((packet) => packet.fromUserId === SENDER_ID && packet.toUserId === RECIPIENT_ID && packet.alertIds.includes(alertId) && packet.status !== "resolved") ?? null;
}

function sendStoryPacket(alert: Alert): ContextPacket {
  const sender = findUser(SENDER_ID) ?? null;
  const recipient = findUser(RECIPIENT_ID);
  if (!recipient) throw new Error(`demo story: missing user ${RECIPIENT_ID}`);
  return createPacket(
    {
      toUserId: RECIPIENT_ID,
      title: "อุบลศรีสุข เทรดดิ้ง แทบไม่สั่งสินค้า",
      ask: "ช่วยแวะอุบลศรีสุขสัปดาห์นี้ เช็กว่าติดวงเงินเครดิตเหมือนเดือนมิถุนายนหรือเปลี่ยนไปรับของเจ้าอื่น แล้วปิดงานพร้อมบอกว่าเป็นเรื่องจริงไหม",
      urgency: "high",
      evidence: [
        {
          metric: "net_sales_volume",
          dims: ["brand"],
          filters: { agent: [STORY_AGENT] },
          range: { from: addDays(TODAY, -LOOKBACK_DAYS), to: TODAY },
          grain: "week",
          compare: "prev_period",
          limit: null,
        },
      ],
      alertIds: [alert.id],
      digest: "ยอดขายเข้าของอุบลศรีสุข เทรดดิ้ง ลดลง 80% ทั้งสิงห์และลีโอ ครั้งก่อนเป็นเรื่องวงเงินเครดิต",
      suggestedActions: ["เช็กวงเงินเครดิตกับฝ่ายการเงิน", "ถามเจ้าของร้านว่ารับของจากเจ้าอื่นไหม"],
      threadId: null,
    },
    sender,
    recipient,
  );
}

/** Adds the one handoff story the demo needs to show closing with a verdict and the lesson from last time; safe to run again. */
export function ensureDemoStory(): DemoStory | null {
  const alert = findOrRunEngine();
  if (!alert) return null;
  const outcomeCreated = ensurePastOutcome(alert);
  const existing = openStoryPacket(alert.id);
  const packet = existing ?? (handoffEnabled() ? sendStoryPacket(alert) : null);
  return { alertId: alert.id, packetId: packet?.id ?? null, outcomeId: PAST_OUTCOME_ID, created: { packet: !existing && packet !== null, outcome: outcomeCreated } };
}
