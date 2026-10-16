import type { MetricResult } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";

/** What a card's numbers say, read by code from its result: attainment against target and change against its comparison, in percent; null where the card does not tell it. */
export type CardFigures = { attainment: number | null; change: number | null };

type MetricAnswer = Extract<MetricResult, { ok: true }>;

const FULL_TARGET = 100;
const FIRST_NUMBER = /-?\d[\d,]*(?:\.\d+)?/;
const UNDER_TARGET = /ไม่ถึงเป้า|ต่ำกว่าเป้า|ไม่เข้าเป้า|หลุดเป้า|พลาดเป้า|ไม่ได้ตามเป้า/;
const AT_TARGET = /เกินเป้า|ทะลุเป้า|ถึงเป้า|ตามเป้า|เข้าเป้า|ปิดเป้า|บรรลุเป้า|ครบเป้า/;
const FALLING = /ลดลง|ตกลง|แย่ลง|ต่ำลง|ร่วง/;
const RISING = /โตขึ้น|เพิ่มขึ้น|ดีขึ้น|สูงขึ้น|โตกว่า/;
const COMPARED = new Set(["prev_period", "prev_year"]);
const CLAIMED_PERCENT = /(\d+(?:\.\d+)?)\s*%/;
const ATTAINMENT_CLAIM = /(\d+(?:\.\d+)?)\s*%\s*ของเป้า/;
const CLAIM_TOLERANCE = 1;

function isMetricAnswer(result: unknown): result is MetricAnswer {
  if (typeof result !== "object" || result === null) return false;
  const answer = result as Partial<MetricAnswer>;
  return answer.ok === true && typeof answer.headline === "object" && answer.headline !== null && typeof answer.query === "object" && answer.query !== null && Array.isArray(answer.rows);
}

function numberIn(text: string): number | null {
  const match = FIRST_NUMBER.exec(text);
  return match ? Number(match[0].replaceAll(",", "")) : null;
}

function attainmentOf(answer: MetricAnswer): number | null {
  if (answer.query.metric === "target_attainment") return numberIn(answer.headline.value);
  const delta = answer.headline.deltaPercent;
  return answer.query.compare === "target" && delta !== null ? FULL_TARGET + delta : null;
}

/** The figures a metric card shows, from its result; null for a result that is not a metric answer. */
export function figuresOf(result: unknown): CardFigures | null {
  if (!isMetricAnswer(result)) return null;
  const change = COMPARED.has(result.query.compare) ? result.headline.deltaPercent : null;
  return { attainment: attainmentOf(result), change };
}

function percentLabel(value: number): string {
  return `${value.toFixed(1)}%`;
}

function targetWarning(text: string, attainment: number | null): string | null {
  if (attainment === null) return null;
  if (UNDER_TARGET.test(text)) return attainment >= FULL_TARGET ? TH.share.contradicts.underTarget(percentLabel(attainment)) : null;
  if (AT_TARGET.test(text)) return attainment < FULL_TARGET ? TH.share.contradicts.atTarget(percentLabel(attainment)) : null;
  return null;
}

function changeWarning(text: string, change: number | null): string | null {
  if (change === null) return null;
  if (RISING.test(text) && change < 0) return TH.share.contradicts.rising(percentLabel(change));
  if (FALLING.test(text) && change > 0) return TH.share.contradicts.falling(percentLabel(change));
  return null;
}

function signedLabel(value: number): string {
  return `${value > 0 ? "+" : ""}${percentLabel(value)}`;
}

function claimedPercent(text: string): number | null {
  const match = CLAIMED_PERCENT.exec(text);
  return match ? Number(match[1]) : null;
}

function attainmentClaimWarning(text: string, attainment: number | null): string | null {
  const match = ATTAINMENT_CLAIM.exec(text);
  const claimed = match ? Number(match[1]) : null;
  if (attainment === null || claimed === null) return null;
  return Math.abs(claimed - attainment) > CLAIM_TOLERANCE ? TH.share.contradicts.attainmentBy(percentLabel(claimed), percentLabel(attainment)) : null;
}

function changeClaimWarning(text: string, change: number | null): string | null {
  const claimed = claimedPercent(text);
  const falling = FALLING.test(text);
  if (change === null || claimed === null || ATTAINMENT_CLAIM.test(text) || (!falling && !RISING.test(text))) return null;
  const signed = falling ? -claimed : claimed;
  return Math.abs(signed - change) > CLAIM_TOLERANCE ? TH.share.contradicts.changeBy(signedLabel(signed), signedLabel(change)) : null;
}

/** One line, worked out by code, when the words the sender sends with a card claim what its numbers do not show (on target while the card is under it, growth while it fell, a percent of target or a change the card does not show); null when they agree or say nothing the card measures. The sender can still send. */
export function contradictionOf(text: string, figures: CardFigures | null): string | null {
  if (!figures || !text.trim()) return null;
  return targetWarning(text, figures.attainment) ?? changeWarning(text, figures.change) ?? attainmentClaimWarning(text, figures.attainment) ?? changeClaimWarning(text, figures.change);
}
