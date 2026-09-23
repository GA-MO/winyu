import type { ActionEvent, Alert, MetricId, MetricResult, WidgetSpec } from "@/lib/contracts";
import { sharpestHarm, weakestRow } from "@/lib/cards/present";
import { formatDelta, formatMetricValue } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";

export const MOVED_PCT = 5;
export const HARMFUL_ROW_PCT = 25;
export const STALE_DAYS = 14;
const DAY_MS = 86_400_000;
const LEVEL_FLOORS: Partial<Record<MetricId, number>> = { target_attainment: 95, days_of_cover: 10 };

export type Attention = { level: "moved" | "steady"; reason: string | null };

export type AttentionInput = { widget: WidgetSpec; result: MetricResult; alerts: readonly Alert[] };

const STEADY: Attention = { level: "steady", reason: null };

function lowestValue(result: Extract<MetricResult, { ok: true }>): number | null {
  const values = result.rows.map((row) => row.value).filter((value): value is number => typeof value === "number");
  return values.length > 0 ? Math.min(...values) : null;
}

function belowFloor(widget: WidgetSpec, result: Extract<MetricResult, { ok: true }>): Attention | null {
  const floor = LEVEL_FLOORS[widget.query.metric];
  const lowest = lowestValue(result);
  if (floor === undefined || lowest === null || lowest >= floor) return null;
  const weakest = weakestRow(widget.query, result);
  const line = formatMetricValue(widget.query.metric, floor);
  return { level: "moved", reason: weakest ? TH.attention.belowAt(line, weakest.label, weakest.value) : TH.attention.below(line, result.headline.value) };
}

/** Whether a pinned card has something to say today: an open alert on its metric, a level under its floor, a headline that moved, or one row that fell hard. */
export function attentionOf({ widget, result, alerts }: AttentionInput): Attention {
  const onMetric = widget.kind === "alert_list" ? alerts : alerts.filter((alert) => alert.metric === widget.query.metric);
  if (onMetric.length > 0) return { level: "moved", reason: TH.attention.alerts(onMetric.length) };
  if (widget.kind === "alert_list" || !result.ok) return STEADY;
  const floor = belowFloor(widget, result);
  if (floor) return floor;
  const delta = result.headline.deltaPercent;
  if (delta !== null && Math.abs(delta) >= MOVED_PCT) {
    return { level: "moved", reason: TH.attention.headline(formatDelta(delta) ?? "", result.headline.compareLabel) };
  }
  const harm = sharpestHarm(widget.query, result, HARMFUL_ROW_PCT);
  if (harm) return { level: "moved", reason: TH.attention.row(harm.label, harm.delta) };
  return STEADY;
}

function daysBetween(fromIso: string, now: number): number {
  return (now - new Date(fromIso).getTime()) / DAY_MS;
}

/**
 * Pinned cards the user has not looked at for two weeks, once there are two weeks of viewing to judge by;
 * the dashboard only offers to remove them, it never does.
 */
export function staleWidgets(widgets: readonly WidgetSpec[], events: readonly ActionEvent[], userId: string, now = Date.now()): WidgetSpec[] {
  const views = events.filter((event) => event.userId === userId && event.kind === "widget_view");
  const firstView = views.reduce<string | null>((first, event) => (first === null || event.at < first ? event.at : first), null);
  if (!firstView || daysBetween(firstView, now) < STALE_DAYS) return [];
  const recent = new Set(views.filter((event) => daysBetween(event.at, now) <= STALE_DAYS).map((event) => event.intentKey));
  return widgets.filter((widget) => widget.pinned && daysBetween(widget.createdAt, now) >= STALE_DAYS && !recent.has(`widget:${widget.id}`));
}
