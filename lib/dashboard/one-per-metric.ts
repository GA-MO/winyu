import type { WidgetSpec } from "@/lib/contracts";

const ALERTS_TOPIC = "alert_list";
const SOURCE_RANK: Record<WidgetSpec["source"], number> = { user_pin: 0, ai_suggested: 1, role_template: 2 };

/** What a card is about for the one-card-per-metric rule: its metric, or the alerts list whatever placeholder query it carries. */
export function topicOf(widget: Pick<WidgetSpec, "kind" | "query">): string {
  return widget.kind === "alert_list" ? ALERTS_TOPIC : widget.query.metric;
}

function preferred(left: WidgetSpec, right: WidgetSpec): WidgetSpec {
  const bySource = SOURCE_RANK[left.source] - SOURCE_RANK[right.source];
  if (bySource !== 0) return bySource < 0 ? left : right;
  if (left.source === "user_pin" && left.createdAt !== right.createdAt) return left.createdAt > right.createdAt ? left : right;
  return left.position <= right.position ? left : right;
}

/**
 * Keeps one pinned card per metric, so two cards never show the same headline: the card named in `keep` wins,
 * then the user's newest pin, then a suggestion, then the starter card first in the layout. The others move to the tray, never deleted.
 */
export function onePinnedPerMetric(widgets: readonly WidgetSpec[], keep: string | null = null): WidgetSpec[] {
  const winners = new Map<string, WidgetSpec>();
  for (const widget of widgets) {
    if (!widget.pinned) continue;
    const topic = topicOf(widget);
    const current = winners.get(topic);
    if (!current) winners.set(topic, widget);
    else if (widget.id === keep) winners.set(topic, widget);
    else if (current.id !== keep) winners.set(topic, preferred(current, widget));
  }
  return widgets.map((widget) => (widget.pinned && winners.get(topicOf(widget))?.id !== widget.id ? { ...widget, pinned: false, version: widget.version + 1 } : widget));
}

/** The pinned cards a new card on this topic would move to the tray. */
export function displacedBy(widgets: readonly WidgetSpec[], card: Pick<WidgetSpec, "kind" | "query">): WidgetSpec[] {
  const topic = topicOf(card);
  return widgets.filter((widget) => widget.pinned && topicOf(widget) === topic);
}

/** Whether an unpinned card would repeat a pinned one line for line: every alert list shows the same open alerts, whatever its title. */
export function repeatsPinned(widget: Pick<WidgetSpec, "kind">, widgets: readonly Pick<WidgetSpec, "kind" | "pinned">[]): boolean {
  return widget.kind === ALERTS_TOPIC && widgets.some((other) => other.pinned && other.kind === ALERTS_TOPIC);
}
