import type { AccessContext, QuickAction } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";

export const LENT_WINDOW_LABEL = "เข้าพรรษา";

const SONGKRAN_MONTH = 4;
const SONGKRAN_DAY = 13;
const LEAD_DAYS = 21;
const MONTH_END_DAYS = 5;
const LENT_END = { month: 9, day: 26 };
const DAY_MS = 86_400_000;

function daysUntil(now: Date, month: number, day: number): number {
  const target = Date.UTC(now.getUTCFullYear(), month - 1, day);
  const passed = target < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const next = passed ? Date.UTC(now.getUTCFullYear() + 1, month - 1, day) : target;
  return Math.round((next - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / DAY_MS);
}

function daysLeftInMonth(now: Date): number {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0);
  return Math.round((end - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / DAY_MS);
}

/** Chips the calendar earns: the Songkran build-up, the month-end close and the end of Buddhist Lent. */
export function seasonalHints(access: AccessContext, now = Date.now()): QuickAction[] {
  const today = new Date(now);
  const hints: QuickAction[] = [];
  if (daysUntil(today, SONGKRAN_MONTH, SONGKRAN_DAY) <= LEAD_DAYS) {
    hints.push({
      id: "qa_season_songkran",
      label: TH.quick.songkran,
      prompt: "เทียบยอดขายช่วงสงกรานต์ปีนี้กับปีที่แล้วแยกตามภาค และบอกว่าสต๊อกพอไหม",
      score: 0.7,
      reason: TH.quick.songkranReason,
      intentKey: "net_sales_volume|region,week",
    });
  }
  if (daysLeftInMonth(today) <= MONTH_END_DAYS) {
    hints.push({
      id: "qa_season_month_end",
      label: TH.quick.monthEnd,
      prompt: "สรุปยอดเทียบเป้าของเดือนนี้ และบอกว่าส่วนไหนยังห่างเป้ามากที่สุด",
      score: 0.68,
      reason: TH.quick.monthEndReason,
      intentKey: "target_attainment|month,region",
    });
  }
  if (daysUntil(today, LENT_END.month, LENT_END.day) <= LEAD_DAYS && access.metricAcl.net_sales_volume !== "none") {
    hints.push({
      id: "qa_season_lent",
      label: TH.quick.lent,
      prompt: "ยอดเบียร์ช่วงเข้าพรรษาปีนี้เทียบปีที่แล้วเป็นอย่างไร และหลังออกพรรษาควรเตรียมสต๊อกเท่าไร",
      score: 0.66,
      reason: TH.quick.lentReason,
      intentKey: "net_sales_volume|brand,week",
    });
  }
  return hints;
}
