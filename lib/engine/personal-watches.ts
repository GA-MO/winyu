import type { MetricQuery, MetricResult, MetricRow, PersonalWatch, WatchCondition } from "@/lib/contracts";
import { TODAY, addDays } from "@/lib/data/dates";
import { formatMetricValue } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";

const DAY_MS = 86_400_000;
const MIN_WINDOW_DAYS = 1;
const DEFAULT_WINDOW_DAYS = 27;
const LEVEL_METRICS: ReadonlySet<MetricQuery["metric"]> = new Set(["days_of_cover", "stock_on_hand"]);

export type WatchHit = { row: MetricRow; value: number };

export type WatchCheck = { breached: boolean; hit: WatchHit | null };

/** How many days the user's question looked back, so the watch keeps asking about "the last N days" instead of a frozen range. */
export function windowDaysOf(query: MetricQuery): number {
  const days = Math.round((Date.parse(query.range.to) - Date.parse(query.range.from)) / DAY_MS);
  return Number.isFinite(days) && days >= MIN_WINDOW_DAYS ? days : DEFAULT_WINDOW_DAYS;
}

/**
 * The watch's query moved to end on the latest data day, over every row (a line can be crossed by the smallest one);
 * a stock level is read on that day alone, because an average over the window hides the day it ran out.
 */
export function rollingQuery(watch: Pick<PersonalWatch, "query" | "windowDays" | "condition">, today = TODAY): MetricQuery {
  const compare = watch.condition.kind === "change" && watch.query.compare === "none" ? "prev_period" : watch.query.compare;
  const from = LEVEL_METRICS.has(watch.query.metric) && watch.condition.kind !== "change" ? today : addDays(today, -watch.windowDays);
  return { ...watch.query, compare, limit: null, range: { from, to: today } };
}

function measure(row: MetricRow, condition: WatchCondition): number | null {
  const key = condition.kind === "change" ? "delta_pct" : "value";
  const value = row[key];
  return typeof value === "number" ? value : null;
}

function crosses(value: number, condition: WatchCondition): boolean {
  if (condition.kind === "below") return value < condition.value;
  if (condition.kind === "above") return value > condition.value;
  return Math.abs(value) >= Math.abs(condition.value);
}

function worse(left: number, right: number, condition: WatchCondition): boolean {
  if (condition.kind === "below") return left < right;
  if (condition.kind === "above") return left > right;
  return Math.abs(left) > Math.abs(right);
}

/** Whether any row of the result crosses the line, and the row that crosses it furthest. */
export function checkWatch(result: MetricResult, condition: WatchCondition): WatchCheck {
  if (!result.ok) return { breached: false, hit: null };
  let hit: WatchHit | null = null;
  for (const row of result.rows) {
    const value = measure(row, condition);
    if (value === null || !crosses(value, condition)) continue;
    if (!hit || worse(value, hit.value, condition)) hit = { row, value };
  }
  return { breached: hit !== null, hit };
}

/** Notify on the way in only: a watch that stays over the line stays quiet until it comes back and crosses again. */
export function nextState(previous: PersonalWatch["state"], breached: boolean): { state: PersonalWatch["state"]; notify: boolean } {
  if (!breached) return { state: "ok", notify: false };
  return { state: "triggered", notify: previous === "ok" };
}

/** What the watch reads as to the user: "ต่ำกว่า 10 วัน", "เปลี่ยนเกิน 10% จากช่วงก่อน". */
export function conditionLabel(query: MetricQuery, condition: WatchCondition): string {
  if (condition.kind === "change") return TH.watch.change(Math.abs(condition.value));
  const line = formatMetricValue(query.metric, condition.value);
  return condition.kind === "below" ? TH.watch.below(line) : TH.watch.above(line);
}
