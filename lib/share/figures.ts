import type { MetricResult } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import type { GoalMeasure } from "./matter";

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

function totalOf(answer: MetricAnswer): number | null {
  const values = answer.rows.map((row) => row.value).filter((value): value is number => typeof value === "number");
  if (values.length === 0) return null;
  const sum = values.reduce((total, value) => total + value, 0);
  return answer.headline.aggregate === "average" ? sum / values.length : sum;
}

/** The one number a goal reads off a result: attainment in percent, or the total (the mean for a metric that averages); null when the result does not tell it. */
export function measureOf(result: unknown, measure: GoalMeasure): number | null {
  if (!isMetricAnswer(result)) return null;
  return measure === "attainment" ? attainmentOf(result) : totalOf(result);
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

/** One line, worked out by code, when the words the sender sends with a card claim what its numbers do not show (on target while the card is under it, growth while it fell); null when they agree or say nothing the card measures. The sender can still send. */
export function contradictionOf(text: string, figures: CardFigures | null): string | null {
  if (!figures || !text.trim()) return null;
  return targetWarning(text, figures.attainment) ?? changeWarning(text, figures.change);
}
