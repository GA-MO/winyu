import { randomUUID } from "node:crypto";
import { runMetric } from "@/lib/server/metrics";
import type { AccessContext, Alert, DashboardLayout, FeedItem, MetricQuery, MetricResult, NextAction, WidgetSpec } from "@/lib/contracts";
import type { Spec } from "vexa/protocol";
import { layoutVersions, layouts } from "@/lib/server/agent/collections";
import { forecastsFor, openAlertsFor, relevantAlertsFor } from "@/lib/server/alerts";
import { alertRowOf } from "@/lib/cards/alert-row";
import { actionsForAlert, actionsForMetric } from "@/lib/server/next-actions";
import { composeSuggestion } from "@/lib/engine/compose";
import type { LandingKpi, VisitStop } from "@/lib/dashboard/ambient";
import { TODAY, addDays } from "@/lib/data/dates";
import type { Dictionary } from "@/lib/semantic/dictionary";
import { loadDictionary } from "@/lib/server/master-data";
import { formatDelta } from "@/lib/dashboard/metric-display";
import { presentCard, sharpestHarm, weakestRow, type CardParts } from "@/lib/cards/present";
import { TH } from "@/lib/i18n/th";
import { templateFor } from "@/lib/dashboard/templates";
import { displacedBy, onePinnedPerMetric } from "@/lib/dashboard/one-per-metric";
import { liveWidget } from "@/lib/dashboard/rolling";
import { widgetToSpec, type WidgetExtras } from "@/lib/dashboard/widget-to-spec";
import { HARMFUL_ROW_PCT, attentionOf, byAttention, staleWidgets, withFeed, type Attention } from "@/lib/dashboard/attention";
import { recordAction } from "@/lib/server/threads";
import { actionEvents } from "@/lib/server/agent/collections";

export type WidgetHeadline = { value: string; delta: string | null; tone: "good" | "bad" | "neutral" };

export type WidgetView = { widget: WidgetSpec; spec: Spec; attention: Attention; headline: WidgetHeadline | null };

const CREATED_AT = "2026-09-22T00:00:00.000Z";
const KPI_LIMIT = 4;
const VISIT_ROLES: ReadonlySet<string> = new Set(["sales_rep"]);
const VISIT_LIMIT = 3;
const VISIT_SCAN_LIMIT = 20;
const VISIT_WINDOW_DAYS = 27;
const ALERT_FIRST = -1000;
const PARENTHETICAL = /\s*\(.*\)$/;
const DAY_MS = 86_400_000;
const FOUR_WEEKS_DAYS = 31;
const MONTH_SHORT = new Intl.DateTimeFormat("th-TH", { month: "short" });

function seedLayout(access: AccessContext): DashboardLayout {
  const widgets = templateFor(access).map((seed, position) => ({
    id: `w_${access.userId}_${seed.key}`,
    userId: access.userId,
    title: seed.title,
    kind: seed.kind,
    query: seed.query,
    sortBy: seed.sortBy,
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

/** The user's dashboard layout, seeded from the role template the first time they arrive; a layout still holding two pinned cards on one metric is settled once and saved. */
export function layoutFor(access: AccessContext): DashboardLayout {
  const stored = layouts().get(access.userId);
  if (!stored || stored.widgets.length === 0) return save(seedLayout(access));
  const layout = withTemplateReasons(stored, access);
  const settled = onePinnedPerMetric(layout.widgets);
  if (settled.every((widget, index) => widget.pinned === layout.widgets[index]?.pinned)) return layout;
  return save({ ...layout, widgets: settled, version: layout.version + 1, updatedAt: new Date().toISOString() });
}

/** A stored layout kept in step with the role template: starter cards follow the template's current definition, and a starter card the template dropped goes with it; cards the user pinned or accepted stay. */
function withTemplateReasons(layout: DashboardLayout, access: AccessContext): DashboardLayout {
  const seeds = new Map(templateFor(access).map((seed) => [`w_${access.userId}_${seed.key}`, seed]));
  const current = layout.widgets.filter((widget) => widget.source !== "role_template" || seeds.has(widget.id));
  const widgets = current.map((widget) => {
    const seed = widget.source === "role_template" ? seeds.get(widget.id) : undefined;
    return seed ? { ...widget, title: seed.title, kind: seed.kind, query: seed.query, sortBy: seed.sortBy, reason: seed.reason } : widget;
  });
  return { ...layout, widgets };
}

/** One card's numbers under the viewer's scope, read through the warehouse port. */
export function resolveWidget(widget: WidgetSpec, access: AccessContext): Promise<MetricResult> {
  return runMetric(widget.query, access);
}

const MAX_CARD_ALERTS = 4;
const OVERLAY_PAIR: Partial<Record<string, { metric: WidgetSpec["query"]["metric"]; name: string }>> = {
  sell_out_volume: { metric: "net_sales_volume", name: "ขายเข้า (Sell-in)" },
};

async function extrasFor(widget: WidgetSpec, access: AccessContext): Promise<WidgetExtras> {
  if (widget.kind === "alert_list") {
    const alerts = relevantAlertsFor(access).slice(0, MAX_CARD_ALERTS);
    const dictionary = await loadDictionary();
    return { alerts: alerts.map((alert) => alertRowOf(alert, dictionary)), actions: actionsForAlert(access, alerts[0] ?? null, dictionary) };
  }
  if (widget.kind !== "line") return {};
  const pair = OVERLAY_PAIR[widget.query.metric];
  if (pair) return { overlay: { name: pair.name, result: await runMetric({ ...widget.query, metric: pair.metric, compare: "none" }, access) } };
  if (widget.query.grain !== "week") return {};
  const forecast = forecastsFor(access).find((entry) => entry.metric === widget.query.metric && Object.entries(entry.dims).every(([dim, value]) => {
    const filter = widget.query.filters[dim as keyof typeof widget.query.filters];
    return filter?.length === 1 && filter[0] === (value as string);
  }));
  return { forecast: forecast ?? null };
}

/** A card already on the dashboard is pinned or carries its own pin button, so its next steps never offer pinning it again. */
function withoutPin(actions: NextAction[]): NextAction[] {
  return actions.filter((action) => action.kind !== "pin");
}

async function viewOf(widget: WidgetSpec, access: AccessContext, relevant: readonly Alert[]): Promise<WidgetView> {
  const [result, extras] = await Promise.all([resolveWidget(widget, access), extrasFor(widget, access)]);
  const actions = withoutPin(extras.actions ?? actionsForMetric(access, widget.query, result, await loadDictionary()));
  const hero = presentCard({ title: widget.title, query: widget.query, result }).hero;
  return {
    widget,
    spec: widgetToSpec(widget, result, { sortBy: widget.sortBy ?? null, ...extras, actions }),
    attention: attentionOf({ widget, result, alerts: relevant }),
    headline: hero ? { value: hero.value, delta: hero.delta, tone: hero.tone } : null,
  };
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

function relevantAlerts(access: AccessContext): Alert[] {
  return relevantAlertsFor(access);
}

/** Every card on the dashboard, the most urgent first; a card about a matter still on the user's feed leads. */
export async function widgetViews(access: AccessContext, feed: readonly FeedItem[] = []): Promise<WidgetView[]> {
  const relevant = relevantAlerts(access);
  return byAttention(withFeed(await Promise.all(layoutFor(access).widgets.map((widget) => viewOf(liveWidget(widget), access, relevant))), feed));
}

/** Pinned cards this user has stopped looking at, offered for removal on the dashboard. */
export function staleFor(access: AccessContext, now = Date.now()): WidgetSpec[] {
  return staleWidgets(layoutFor(access).widgets, actionEvents().all(), access.userId, now);
}

/** The headline of each pinned card, the most urgent first as on the dashboard, through the same presenter the dashboard draws with; masked or denied cards are skipped. */
/** A second tile on a metric already shown names the group that moved instead of repeating the headline; null when no group moved enough to name. */
function moverKpi(widget: WidgetSpec, result: MetricResult, detail: string | null): LandingKpi | null {
  const harm = sharpestHarm(widget.query, result, HARMFUL_ROW_PCT);
  if (!harm) return null;
  return { id: widget.id, label: widget.title, value: harm.label, delta: harm.delta, tone: "bad", detail, note: null };
}

/** The one row that makes a breakdown worth a tile: the weakest level, the sharpest harmful move, or how far a progress card has to go. */
function kpiNoteOf(query: MetricQuery, result: MetricResult, parts: CardParts): string | null {
  const weakest = weakestRow(query, result);
  if (weakest) return TH.dash.weakest(weakest.lowIsWorst, weakest.label, weakest.value);
  const harm = sharpestHarm(query, result, HARMFUL_ROW_PCT);
  if (harm) return TH.landing.sharpest(harm.label, harm.delta);
  return parts.body.kind === "progress" ? parts.body.detail : null;
}

export async function landingKpis(access: AccessContext): Promise<LandingKpi[]> {
  const kpis: LandingKpi[] = [];
  const relevant = relevantAlerts(access);
  const pinned = await Promise.all(layoutFor(access).widgets
    .filter((widget) => widget.pinned && widget.kind !== "alert_list")
    .map((widget) => liveWidget(widget))
    .map(async (widget) => {
      const result = await resolveWidget(widget, access);
      return { widget, result, attention: attentionOf({ widget, result, alerts: relevant }) };
    }));
  const shownMetrics = new Set<string>();
  for (const { widget, result } of byAttention(pinned)) {
    if (kpis.length >= KPI_LIMIT) break;
    const parts = presentCard({ title: widget.title, query: widget.query, result });
    const hero = parts.hero;
    if (!hero || kpis.some((kpi) => kpi.label === hero.label && kpi.value === hero.value)) continue;
    const mover = shownMetrics.has(widget.query.metric) ? moverKpi(widget, result, hero.detail) : null;
    if (mover) {
      kpis.push(mover);
      continue;
    }
    shownMetrics.add(widget.query.metric);
    const note = kpiNoteOf(widget.query, result, parts);
    kpis.push({ id: widget.id, label: hero.label, value: hero.value, delta: hero.delta, tone: hero.tone, detail: hero.detail, note, period: periodTag(widget.query.range) });
  }
  return withPeriodsWhereAlike(kpis);
}

/** A short name for a tile's period: the month, "4 สัปดาห์ล่าสุด", or the months it spans. */
function periodTag(range: MetricQuery["range"]): string {
  const days = (Date.parse(range.to) - Date.parse(range.from)) / DAY_MS + 1;
  if (range.from.slice(0, 7) === range.to.slice(0, 7)) return MONTH_SHORT.format(new Date(range.to));
  if (days <= FOUR_WEEKS_DAYS) return TH.landing.lastFourWeeks;
  return `${MONTH_SHORT.format(new Date(range.from))}–${MONTH_SHORT.format(new Date(range.to))}`;
}

/** Two tiles with the same name say which period each covers; a name that stands alone keeps it short. */
function withPeriodsWhereAlike(kpis: LandingKpi[]): LandingKpi[] {
  return kpis.map((kpi) => {
    const alike = kpis.filter((other) => other.label === kpi.label).length > 1;
    return alike && kpi.period ? { ...kpi, label: `${kpi.label} · ${kpi.period}` } : kpi;
  });
}

function alertReason(alert: Alert, dictionary: Dictionary): string {
  const row = alertRowOf(alert, dictionary);
  const sign = alert.direction === "down" ? "−" : "+";
  return row.gapLabel ? TH.landing.visitAlert(row.metricLabel.replace(PARENTHETICAL, ""), `${sign}${row.gapLabel}`) : row.severityLabel;
}

/** The agents a field rep should visit first: those with an open alert, then the steepest sell-in drop. Reps only. */
export async function visitsFor(access: AccessContext): Promise<VisitStop[]> {
  if (!VISIT_ROLES.has(access.role)) return [];
  const result = await runMetric({ metric: "net_sales_volume", dims: ["agent"], filters: {}, range: { from: addDays(TODAY, -VISIT_WINDOW_DAYS), to: TODAY }, grain: "month", compare: "prev_period", limit: VISIT_SCAN_LIMIT }, access);
  if (!result.ok) return [];
  const dictionary = await loadDictionary();
  const alerted = new Map<string, Alert>();
  for (const alert of openAlertsFor(access)) {
    const agent = alert.dims.agent ? dictionary.displayLabel("agent", alert.dims.agent) : null;
    if (agent && !alerted.has(agent)) alerted.set(agent, alert);
  }
  const stops = result.rows
    .map((row) => ({ agent: String(row.agent ?? ""), delta: typeof row.delta_pct === "number" ? row.delta_pct : null }))
    .filter((row) => row.agent)
    .map((row) => {
      const alert = alerted.get(row.agent) ?? null;
      const rank = (alert ? ALERT_FIRST : 0) + (row.delta ?? 0);
      const reason = alert ? alertReason(alert, dictionary) : TH.landing.visitDrop(formatDelta(row.delta) ?? "—");
      const tone: VisitStop["tone"] = alert ? (alert.severity === "P1" ? "danger" : "warning") : (row.delta ?? 0) < 0 ? "warning" : "neutral";
      return { rank, stop: { id: row.agent, agent: row.agent, reason, tone, prompt: TH.landing.visitPrompt(row.agent) } };
    })
    .filter((entry) => entry.rank < 0)
    .sort((left, right) => left.rank - right.rank);
  return stops.slice(0, VISIT_LIMIT).map((entry) => entry.stop);
}

function mutate(access: AccessContext, change: (widgets: WidgetSpec[]) => WidgetSpec[]): DashboardLayout {
  const layout = layoutFor(access);
  const widgets = change(layout.widgets.slice().sort((left, right) => left.position - right.position)).map((widget, position) => ({ ...widget, position }));
  return save({ ...layout, widgets, version: layout.version + 1, updatedAt: new Date().toISOString() });
}

/** Pins or unpins one card; pinning moves any other pinned card on the same metric (and a starter card a suggestion was made in place of) back to the tray. */
export function setWidgetPinned(access: AccessContext, widgetId: string, pinned: boolean): DashboardLayout {
  return mutate(access, (widgets) => {
    const replaces = pinned ? widgets.find((widget) => widget.id === widgetId)?.replaces ?? null : null;
    const changed = widgets.map((widget) => {
      if (widget.id === widgetId) return { ...widget, pinned, source: pinned ? ("user_pin" as const) : widget.source, version: widget.version + 1 };
      if (widget.id === replaces) return { ...widget, pinned: false, version: widget.version + 1 };
      return widget;
    });
    return pinned ? onePinnedPerMetric(changed, widgetId) : changed;
  });
}

export type PinnedCard = { widget: WidgetSpec; replaced: WidgetSpec[] };

/** Adds a card the user asked for in chat to the end of the pinned cards, seeding the role template first if this is their first card; a pinned card on the same metric moves to the tray and is named in `replaced`. */
export function pinNewWidget(access: AccessContext, card: Pick<WidgetSpec, "title" | "kind" | "query">): PinnedCard {
  const widget: WidgetSpec = { ...card, id: randomUUID(), userId: access.userId, pinned: true, position: 0, source: "user_pin", reason: null, createdAt: new Date().toISOString(), version: 1 };
  const replaced = displacedBy(layoutFor(access).widgets, card);
  const layout = mutate(access, (widgets) => onePinnedPerMetric([...widgets, widget], widget.id));
  return { widget: layout.widgets.find((entry) => entry.id === widget.id) ?? widget, replaced };
}

/** Takes a card off the dashboard; a suggestion taken off is remembered so it is not offered again. */
export function removeWidget(access: AccessContext, widgetId: string): DashboardLayout {
  const removed = layoutFor(access).widgets.find((widget) => widget.id === widgetId);
  if (removed?.source === "ai_suggested") recordAction(access.userId, "dismiss", `widget:${widgetId}`, null, null);
  return mutate(access, (widgets) => widgets.filter((widget) => widget.id !== widgetId));
}
