import { runMetric } from "@/lib/data/query";
import type { AccessContext, DashboardLayout, MetricResult, WidgetSpec } from "@/lib/contracts";
import type { Spec } from "vexa/protocol";
import { layoutVersions, layouts } from "@/lib/server/agent/collections";
import { forecastsFor, openAlertsFor, openPacketsFor } from "@/lib/server/alerts";
import { composeSuggestion } from "@/lib/engine/compose";
import { morningBriefFor } from "@/lib/server/briefing";
import { ambientCards, type AmbientCard } from "@/lib/dashboard/ambient";
import { templateFor } from "@/lib/dashboard/templates";
import { widgetToSpec, type WidgetExtras } from "@/lib/dashboard/widget-to-spec";
import { findUser } from "@/lib/data/entities/users";

export type WidgetView = { widget: WidgetSpec; spec: Spec };

const CREATED_AT = "2026-09-22T00:00:00.000Z";
const BACKDROP_LIMIT = 6;

function seedLayout(access: AccessContext): DashboardLayout {
  const widgets = templateFor(access).map((seed, position) => ({
    id: `w_${access.userId}_${seed.key}`,
    userId: access.userId,
    title: seed.title,
    kind: seed.kind,
    query: seed.query,
    pinned: seed.pinned,
    position,
    source: seed.source,
    reason: seed.reason,
    createdAt: CREATED_AT,
    version: 1,
  })) satisfies WidgetSpec[];
  return { id: access.userId, userId: access.userId, version: 1, widgets, updatedAt: new Date().toISOString() };
}

function save(layout: DashboardLayout): DashboardLayout {
  layouts().put(layout);
  layoutVersions().put({ id: `${layout.userId}_${layout.version}`, userId: layout.userId, version: layout.version, widgets: layout.widgets, savedAt: layout.updatedAt });
  return layout;
}

export function layoutHistory(access: AccessContext) {
  return layoutVersions()
    .where((entry) => entry.userId === access.userId)
    .sort((left, right) => right.version - left.version);
}

/** Puts back the newest layout saved before today, so an overnight change can be undone. */
export function rollbackToYesterday(access: AccessContext): DashboardLayout | null {
  const today = new Date().toISOString().slice(0, 10);
  const previous = layoutHistory(access).find((entry) => entry.savedAt.slice(0, 10) < today);
  if (!previous) return null;
  const layout = layoutFor(access);
  return save({ ...layout, widgets: previous.widgets, version: layout.version + 1, updatedAt: new Date().toISOString() });
}

/** The user's dashboard layout, seeded from the role template the first time they arrive. */
export function layoutFor(access: AccessContext): DashboardLayout {
  const stored = layouts().get(access.userId);
  if (stored && stored.widgets.length > 0) return stored;
  return save(seedLayout(access));
}

/** Swap point for the orchestrator: 1A's `runMetric(widget.query, access)` replaces the placeholder without changing this signature. */
export function resolveWidget(widget: WidgetSpec, access: AccessContext): MetricResult {
  return runMetric(widget.query, access);
}

const OVERLAY_PAIR: Partial<Record<string, { metric: WidgetSpec["query"]["metric"]; name: string }>> = {
  sell_out_volume: { metric: "net_sales_volume", name: "ขายเข้า (Sell-in)" },
};

function extrasFor(widget: WidgetSpec, access: AccessContext): WidgetExtras {
  if (widget.kind === "alert_list") {
    return { alerts: openAlertsFor(access).filter((alert) => alert.metric === widget.query.metric || widget.query.dims.length === 0).slice(0, 4) };
  }
  if (widget.kind !== "line") return {};
  const pair = OVERLAY_PAIR[widget.query.metric];
  if (pair) return { overlay: { name: pair.name, result: runMetric({ ...widget.query, metric: pair.metric, compare: "none" }, access) } };
  const forecast = forecastsFor(access).find((entry) => entry.metric === widget.query.metric && Object.entries(entry.dims).every(([dim, value]) => {
    const filter = widget.query.filters[dim as keyof typeof widget.query.filters];
    return !filter || filter.includes(value as string);
  }));
  return { forecast: forecast ?? null };
}

function viewOf(widget: WidgetSpec, access: AccessContext): WidgetView {
  return { widget, spec: widgetToSpec(widget, resolveWidget(widget, access), extrasFor(widget, access)) };
}

/** Adds at most one AI-suggested card a day to the tray, from what the user keeps asking. */
export async function refreshSuggestions(access: AccessContext): Promise<DashboardLayout> {
  const layout = layoutFor(access);
  const suggestion = await composeSuggestion(access, layout.widgets);
  if (!suggestion) return layout;
  return save({
    ...layout,
    widgets: [...layout.widgets, { ...suggestion, position: layout.widgets.length }],
    version: layout.version + 1,
    updatedAt: new Date().toISOString(),
  });
}

export function widgetViews(access: AccessContext): WidgetView[] {
  return layoutFor(access)
    .widgets.slice()
    .sort((left, right) => left.position - right.position)
    .map((widget) => viewOf(widget, access));
}

export function pinnedViews(access: AccessContext): WidgetView[] {
  return widgetViews(access)
    .filter((view) => view.widget.pinned)
    .slice(0, BACKDROP_LIMIT);
}

export { openAlertsFor, openPacketsFor };

/** Cop's opening line: what it found overnight, or that nothing is wrong. */
export function morningBrief(access: AccessContext): string {
  return morningBriefFor(access).line;
}

export function ambientFor(access: AccessContext): AmbientCard[] {
  const brief = morningBriefFor(access);
  const openAlerts = openAlertsFor(access);
  const openPackets = openPacketsFor(access);
  const packet = openPackets[0] ?? null;
  const fromName = packet ? (findUser(packet.fromUserId)?.nameTh ?? packet.fromUserId) : "";
  return ambientCards({
    alert: openAlerts[0] ?? null,
    packet: packet ? { id: packet.id, title: packet.title, ask: packet.ask, fromName, urgency: packet.urgency } : null,
    brief: brief.line,
    bullets: brief.bullets,
    counts: { alerts: openAlerts.length, packets: openPackets.length, widgets: layoutFor(access).widgets.filter((widget) => widget.pinned).length },
  });
}

function mutate(access: AccessContext, change: (widgets: WidgetSpec[]) => WidgetSpec[]): DashboardLayout {
  const layout = layoutFor(access);
  const widgets = change(layout.widgets.slice().sort((left, right) => left.position - right.position)).map((widget, position) => ({ ...widget, position }));
  return save({ ...layout, widgets, version: layout.version + 1, updatedAt: new Date().toISOString() });
}

export function setWidgetPinned(access: AccessContext, widgetId: string, pinned: boolean): DashboardLayout {
  return mutate(access, (widgets) => widgets.map((widget) => (widget.id === widgetId ? { ...widget, pinned, source: pinned ? "user_pin" : widget.source, version: widget.version + 1 } : widget)));
}

export function moveWidget(access: AccessContext, widgetId: string, direction: "up" | "down"): DashboardLayout {
  return mutate(access, (widgets) => {
    const index = widgets.findIndex((widget) => widget.id === widgetId);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || target < 0 || target >= widgets.length) return widgets;
    const next = widgets.slice();
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
}

export function removeWidget(access: AccessContext, widgetId: string): DashboardLayout {
  return mutate(access, (widgets) => widgets.filter((widget) => widget.id !== widgetId));
}
