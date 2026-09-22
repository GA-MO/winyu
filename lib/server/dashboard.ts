import { runMetric } from "@/lib/data/query";
import type { AccessContext, Alert, ContextPacket, DashboardLayout, MetricResult, WidgetSpec } from "@/lib/contracts";
import type { Spec } from "vexa/protocol";
import { alerts, layouts, packets } from "@/lib/server/agent/collections";
import { ambientCards, type AmbientCard } from "@/lib/dashboard/ambient";
import { templateFor } from "@/lib/dashboard/templates";
import { widgetToSpec } from "@/lib/dashboard/widget-to-spec";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";

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
  return layout;
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

function viewOf(widget: WidgetSpec, access: AccessContext): WidgetView {
  return { widget, spec: widgetToSpec(widget, resolveWidget(widget, access)) };
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

function inScope(alert: Alert, access: AccessContext): boolean {
  if (alert.ownerUserId === access.userId) return true;
  if (access.regions === "all") return true;
  const region = alert.dims.region;
  return !region || access.regions.includes(region as never);
}

export function openAlertsFor(access: AccessContext): Alert[] {
  return alerts()
    .where((alert) => alert.status === "open" && inScope(alert, access))
    .sort((left, right) => left.severity.localeCompare(right.severity) || right.at.localeCompare(left.at));
}

export function openPacketsFor(access: AccessContext): ContextPacket[] {
  return packets()
    .where((packet) => packet.toUserId === access.userId && packet.status !== "resolved")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

/** Cop's opening line: what it found overnight, or that nothing is wrong. */
export function morningBrief(access: AccessContext): string {
  const alertCount = openAlertsFor(access).length;
  const packetCount = openPacketsFor(access).length;
  const parts: string[] = [];
  if (alertCount > 0) parts.push(TH.brief.alerts(alertCount));
  if (packetCount > 0) parts.push(TH.brief.packets(packetCount));
  if (parts.length === 0) return TH.brief.quiet;
  return `${parts.join(TH.brief.join)}${TH.brief.suffix}`;
}

export function ambientFor(access: AccessContext): AmbientCard[] {
  const openAlerts = openAlertsFor(access);
  const openPackets = openPacketsFor(access);
  const alert = openAlerts[0] ?? null;
  const packet = openPackets[0] ?? null;
  const fromName = packet ? (findUser(packet.fromUserId)?.nameTh ?? packet.fromUserId) : "";
  return ambientCards({
    alert,
    packet: packet ? { id: packet.id, title: packet.title, ask: packet.ask, fromName, urgency: packet.urgency } : null,
    brief: morningBrief(access),
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
