import type { ActionEvent, Alert, FeedItem, MetricId, MetricResult, WidgetSpec } from "@/lib/contracts";
import { kindLabel, metricOfFeedKind } from "@/lib/engine/feed-learning";
import { headlineChangeOf, sharpestHarm, weakestRow } from "@/lib/cards/present";
import { formatDelta, formatMetricValue, toneOf } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";

export const MOVED_PCT = 5;
export const HARMFUL_ROW_PCT = 25;
export const STALE_DAYS = 14;
const DAY_MS = 86_400_000;
const LEVEL_FLOORS: Partial<Record<MetricId, number>> = { target_attainment: 95, days_of_cover: 10 };
const TIER_SPAN = 100;
const TIER = { feed: 5, alert: 4, floor: 3, harmfulHeadline: 2, headline: 1, row: 0 } as const;
const SEVERITY_WEIGHT: Record<Alert["severity"], number> = { P1: 2, P2: 1, P3: 0 };
const SEVERITY_SPAN = 33;
const FEED_RANK_SCALE = 10;

/** `score` ranks the moved cards against each other, most urgent first; a steady card scores 0. */
export type Attention = { level: "moved" | "steady"; reason: string | null; score: number };

export type AttentionInput = { widget: WidgetSpec; result: MetricResult; alerts: readonly Alert[] };

const STEADY: Attention = { level: "steady", reason: null, score: 0 };

function scoreIn(tier: number, magnitude: number): number {
  return (tier + 1) * TIER_SPAN + Math.min(TIER_SPAN - 1, Math.max(0, magnitude));
}

function alertMagnitude(alerts: readonly Alert[]): number {
  const worst = Math.max(...alerts.map((alert) => SEVERITY_WEIGHT[alert.severity]));
  return worst * SEVERITY_SPAN + Math.min(SEVERITY_SPAN - 1, alerts.length - 1);
}

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
  const gapPercent = ((floor - lowest) / floor) * 100;
  return { level: "moved", score: scoreIn(TIER.floor, gapPercent), reason: weakest ? TH.attention.belowAt(line, weakest.label, weakest.value) : TH.attention.below(line, result.headline.value) };
}

/**
 * Whether a pinned card has something to say today and how urgently, in this order: an open alert on its metric (worst severity first),
 * a level under its floor (furthest under first), a headline that moved (the harmful direction before the good one, bigger first), one row that fell hard.
 */
export function attentionOf({ widget, result, alerts }: AttentionInput): Attention {
  const onMetric = widget.kind === "alert_list" ? alerts : alerts.filter((alert) => alert.metric === widget.query.metric);
  if (onMetric.length > 0) return { level: "moved", reason: TH.attention.alerts(onMetric.length), score: scoreIn(TIER.alert, alertMagnitude(onMetric)) };
  if (widget.kind === "alert_list" || !result.ok) return STEADY;
  const floor = belowFloor(widget, result);
  if (floor) return floor;
  const { deltaPercent: delta, compareLabel } = headlineChangeOf(widget.query, result);
  if (delta !== null && Math.abs(delta) >= MOVED_PCT) {
    const tier = toneOf(widget.query.metric, delta) === "bad" ? TIER.harmfulHeadline : TIER.headline;
    return { level: "moved", reason: TH.attention.headline(formatDelta(delta) ?? "", compareLabel), score: scoreIn(tier, Math.abs(delta)) };
  }
  const harm = sharpestHarm(widget.query, result, HARMFUL_ROW_PCT);
  if (harm) return { level: "moved", reason: TH.attention.row(harm.label, harm.delta), score: scoreIn(TIER.row, Math.abs(harm.deltaPercent)) };
  return STEADY;
}

/** Pinned cards in the order the user should read them: the most urgent first, the saved position between equals. */
export function byAttention<T extends { widget: WidgetSpec; attention: Attention }>(views: readonly T[]): T[] {
  return views.slice().sort((left, right) => right.attention.score - left.attention.score || left.widget.position - right.widget.position);
}

function relatesTo(widget: WidgetSpec, item: FeedItem): boolean {
  if (widget.kind === "alert_list") return item.source === "alert";
  return metricOfFeedKind(item.kind) === widget.query.metric;
}

/** Cards about a matter still on the user's feed move to the front, the most urgent matter first, and say which matters when nothing else moved them. */
export function withFeed<T extends { widget: WidgetSpec; attention: Attention }>(views: readonly T[], feed: readonly FeedItem[]): T[] {
  return views.map((view) => {
    const related = feed.filter((item) => relatesTo(view.widget, item));
    const top = related.reduce<FeedItem | null>((best, item) => (best === null || item.rank > best.rank ? item : best), null);
    if (!top) return view;
    const reason = view.attention.level === "moved" ? view.attention.reason : TH.attention.onFeed(kindLabel(top.kind), related.length);
    return { ...view, attention: { level: "moved", reason, score: scoreIn(TIER.feed, top.rank / FEED_RANK_SCALE) } };
  });
}

function daysBetween(fromIso: string, now: number): number {
  return (now - new Date(fromIso).getTime()) / DAY_MS;
}

function widgetViewsOf(events: readonly ActionEvent[], userId: string, now: number): ActionEvent[] | null {
  const views = events.filter((event) => event.userId === userId && event.kind === "widget_view");
  const firstView = views.reduce<string | null>((first, event) => (first === null || event.at < first ? event.at : first), null);
  return firstView && daysBetween(firstView, now) >= STALE_DAYS ? views : null;
}

/**
 * Pinned cards the user has not looked at for two weeks, once there are two weeks of viewing to judge by;
 * the dashboard only offers to remove them, it never does.
 */
export function staleWidgets(widgets: readonly WidgetSpec[], events: readonly ActionEvent[], userId: string, now = Date.now()): WidgetSpec[] {
  const views = widgetViewsOf(events, userId, now);
  if (!views) return [];
  const recent = new Set(views.filter((event) => daysBetween(event.at, now) <= STALE_DAYS).map((event) => event.intentKey));
  return widgets.filter((widget) => widget.pinned && daysBetween(widget.createdAt, now) >= STALE_DAYS && !recent.has(`widget:${widget.id}`));
}

/** Starter cards the user has never looked at, once there are two weeks of viewing to judge by; the dashboard offers what they asked for in their place, it never swaps them itself. */
export function untouchedTemplates(widgets: readonly WidgetSpec[], events: readonly ActionEvent[], userId: string, now = Date.now()): WidgetSpec[] {
  const views = widgetViewsOf(events, userId, now);
  if (!views) return [];
  const seen = new Set(views.map((event) => event.intentKey));
  return widgets.filter((widget) => widget.pinned && widget.source === "role_template" && !seen.has(`widget:${widget.id}`));
}
