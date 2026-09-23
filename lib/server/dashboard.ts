import { runMetric } from "@/lib/data/query";
import type { AccessContext, Alert, DashboardLayout, MetricResult, WidgetSpec } from "@/lib/contracts";
import type { Spec } from "vexa/protocol";
import { layoutVersions, layouts } from "@/lib/server/agent/collections";
import { forecastsFor, openAlertsFor, openPacketsFor, relevanceOf } from "@/lib/server/alerts";
import { alertRowOf } from "@/lib/cards/alert-row";
import { actionsForAlert, actionsForMetric } from "@/lib/server/next-actions";
import { composeSuggestion } from "@/lib/engine/compose";
import { ambientCards, statusLinks, type AmbientCard, type LandingKpi, type StatusLink, type VisitStop } from "@/lib/dashboard/ambient";
import { TODAY, addDays } from "@/lib/data/dates";
import { displayLabel } from "@/lib/semantic/dictionary";
import { formatDelta } from "@/lib/dashboard/metric-display";
import { presentCard, weakestRow } from "@/lib/cards/present";
import { TH } from "@/lib/i18n/th";
import { templateFor } from "@/lib/dashboard/templates";
import { widgetToSpec, type WidgetExtras } from "@/lib/dashboard/widget-to-spec";
import { findUser } from "@/lib/data/entities/users";

export type WidgetView = { widget: WidgetSpec; spec: Spec };

const CREATED_AT = "2026-09-22T00:00:00.000Z";
const KPI_LIMIT = 4;
const VISIT_ROLES: ReadonlySet<string> = new Set(["sales_rep"]);
const VISIT_LIMIT = 3;
const VISIT_SCAN_LIMIT = 20;
const VISIT_WINDOW_DAYS = 27;
const ALERT_FIRST = -1000;
const PARENTHETICAL = /\s*\(.*\)$/;

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

const MAX_CARD_ALERTS = 4;
const OVERLAY_PAIR: Partial<Record<string, { metric: WidgetSpec["query"]["metric"]; name: string }>> = {
  sell_out_volume: { metric: "net_sales_volume", name: "ขายเข้า (Sell-in)" },
};

function extrasFor(widget: WidgetSpec, access: AccessContext): WidgetExtras {
  if (widget.kind === "alert_list") {
    const alerts = openAlertsFor(access)
      .filter((alert) => alert.metric === widget.query.metric || widget.query.dims.length === 0)
      .slice(0, MAX_CARD_ALERTS);
    return { alerts: alerts.map(alertRowOf), actions: actionsForAlert(access, alerts[0] ?? null) };
  }
  if (widget.kind !== "line") return {};
  const pair = OVERLAY_PAIR[widget.query.metric];
  if (pair) return { overlay: { name: pair.name, result: runMetric({ ...widget.query, metric: pair.metric, compare: "none" }, access) } };
  if (widget.query.grain !== "week") return {};
  const forecast = forecastsFor(access).find((entry) => entry.metric === widget.query.metric && Object.entries(entry.dims).every(([dim, value]) => {
    const filter = widget.query.filters[dim as keyof typeof widget.query.filters];
    return filter?.length === 1 && filter[0] === (value as string);
  }));
  return { forecast: forecast ?? null };
}

function viewOf(widget: WidgetSpec, access: AccessContext): WidgetView {
  const result = resolveWidget(widget, access);
  const extras = extrasFor(widget, access);
  const actions = extras.actions ?? actionsForMetric(access, widget.query, result);
  return { widget, spec: widgetToSpec(widget, result, { ...extras, actions }) };
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

/** The headline of each pinned card, through the same presenter the dashboard draws with; masked or denied cards are skipped. */
export function landingKpis(access: AccessContext): LandingKpi[] {
  const kpis: LandingKpi[] = [];
  const pinned = layoutFor(access).widgets.filter((widget) => widget.pinned && widget.kind !== "alert_list").sort((left, right) => left.position - right.position);
  for (const widget of pinned) {
    if (kpis.length >= KPI_LIMIT) break;
    const result = resolveWidget(widget, access);
    const parts = presentCard({ title: widget.title, query: widget.query, result });
    const hero = parts.hero;
    if (!hero) continue;
    const weakest = weakestRow(widget.query, result);
    const note = weakest ? TH.landing.weakest(weakest.lowIsWorst, weakest.label, weakest.value) : parts.body.kind === "progress" ? parts.body.detail : null;
    kpis.push({ id: widget.id, label: hero.label, value: hero.value, delta: hero.delta, tone: hero.tone, detail: hero.detail, note });
  }
  return kpis;
}

export { openAlertsFor, openPacketsFor };

/** The inbox links under the greeting: open alerts per severity and the handoffs waiting for this user. */
export function landingStatus(access: AccessContext): StatusLink[] {
  const open = openAlertsFor(access);
  const relevant = open.filter((alert) => relevanceOf(alert, access) !== "other");
  return statusLinks(relevant, open.length - relevant.length, openPacketsFor(access).length);
}

function alertReason(alert: Alert): string {
  const row = alertRowOf(alert);
  const sign = alert.direction === "down" ? "−" : "+";
  return row.gapLabel ? TH.landing.visitAlert(row.metricLabel.replace(PARENTHETICAL, ""), `${sign}${row.gapLabel}`) : row.severityLabel;
}

/** The agents a field rep should visit first: those with an open alert, then the steepest sell-in drop. Reps only. */
export function visitsFor(access: AccessContext): VisitStop[] {
  if (!VISIT_ROLES.has(access.role)) return [];
  const result = runMetric({ metric: "net_sales_volume", dims: ["agent"], filters: {}, range: { from: addDays(TODAY, -VISIT_WINDOW_DAYS), to: TODAY }, grain: "month", compare: "prev_period", limit: VISIT_SCAN_LIMIT }, access);
  if (!result.ok) return [];
  const alerted = new Map<string, Alert>();
  for (const alert of openAlertsFor(access)) {
    const agent = alert.dims.agent;
    if (agent && !alerted.has(agent)) alerted.set(displayLabel("agent", agent), alert);
  }
  const stops = result.rows
    .map((row) => ({ agent: String(row.agent ?? ""), delta: typeof row.delta_pct === "number" ? row.delta_pct : null }))
    .filter((row) => row.agent)
    .map((row) => {
      const alert = alerted.get(row.agent) ?? null;
      const rank = (alert ? ALERT_FIRST : 0) + (row.delta ?? 0);
      const reason = alert ? alertReason(alert) : TH.landing.visitDrop(formatDelta(row.delta) ?? "—");
      const tone: VisitStop["tone"] = alert ? (alert.severity === "P1" ? "danger" : "warning") : (row.delta ?? 0) < 0 ? "warning" : "neutral";
      return { rank, stop: { id: row.agent, agent: row.agent, reason, tone, prompt: TH.landing.visitPrompt(row.agent) } };
    })
    .filter((entry) => entry.rank < 0)
    .sort((left, right) => left.rank - right.rank);
  return stops.slice(0, VISIT_LIMIT).map((entry) => entry.stop);
}

export function ambientFor(access: AccessContext): AmbientCard[] {
  const packet = openPacketsFor(access)[0] ?? null;
  const fromName = packet ? (findUser(packet.fromUserId)?.nameTh ?? packet.fromUserId) : "";
  return ambientCards({
    alerts: openAlertsFor(access).filter((alert) => relevanceOf(alert, access) !== "other"),
    ownerName: (alert) => (alert.ownerUserId === access.userId ? null : (findUser(alert.ownerUserId)?.nameTh ?? null)),
    actionsFor: (alert) => actionsForAlert(access, alert),
    packet: packet ? { id: packet.id, title: packet.title, ask: packet.ask, fromName, urgency: packet.urgency } : null,
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
