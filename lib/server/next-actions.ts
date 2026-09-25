import type { AccessContext, Alert, Dim, MetricQuery, MetricResult, NextAction, QuickAction, Region } from "@/lib/contracts";
import { widgetKindFor } from "@/lib/cards/present";
import { GEO_LEVELS, geoValueOf } from "@/lib/semantic/geo";
import type { Dictionary } from "@/lib/semantic/dictionary";
import { sharpestHarm } from "@/lib/cards/present";
import { nextActionsFor } from "@/lib/engine/next-actions";
import { followUpsFor, learnedKindShare } from "@/lib/engine/follow-ups";
import { alertScopeLabel } from "@/lib/cards/alert-row";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { openAlertsFor, openPacketCarrying } from "@/lib/server/alerts";
import { actionEvents, layouts } from "@/lib/server/agent/collections";
import { isPinnedSlice } from "@/lib/engine/compose";
import { intentKeyOf } from "@/lib/server/threads";

const PERCENT = 100;
const HARM_MIN_PCT = 5;
const REPEAT_DAYS = 30;
const DAY_MS = 86_400_000;

/** A handoff is offered once: when every alert it would carry is already in someone's inbox, the button goes. */
function withoutRepeatHandoff(actions: NextAction[], alertIds: readonly string[]): NextAction[] {
  const handed = alertIds.length > 0 && alertIds.every((id) => openPacketCarrying(id) !== null);
  return handed ? actions.filter((action) => action.kind !== "handoff") : actions;
}

function repeatsOf(userId: string, query: MetricQuery, now = Date.now()): number {
  const key = intentKeyOf(query.metric, query.dims);
  return actionEvents().where(
    (event) => event.userId === userId && event.intentKey === key && now - new Date(event.at).getTime() <= REPEAT_DAYS * DAY_MS,
  ).length;
}

function alreadyPinned(userId: string, query: MetricQuery): boolean {
  return isPinnedSlice(layouts().get(userId)?.widgets ?? [], query);
}

function sharedGeoLevel(alert: Alert, dim: Dim): Dim | null {
  const alertLevel = GEO_LEVELS.findLast((level) => alert.dims[level]) ?? null;
  if (!alertLevel) return null;
  return GEO_LEVELS.indexOf(alertLevel) < GEO_LEVELS.indexOf(dim) ? alertLevel : dim;
}

function alertCovers(dictionary: Dictionary, alert: Alert, dim: Dim, values: readonly string[]): boolean {
  if (!GEO_LEVELS.includes(dim)) {
    const scope = alert.dims[dim];
    return !scope || values.includes(scope);
  }
  const level = sharedGeoLevel(alert, dim);
  if (!level) return false;
  const alertValue = geoValueOf(dictionary, alert.dims, level);
  return values.some((value) => geoValueOf(dictionary, { [dim]: value }, level) === alertValue);
}

function matchesQuery(dictionary: Dictionary, alert: Alert, query: MetricQuery): boolean {
  if (alert.metric !== query.metric) return false;
  return Object.entries(query.filters).every(([dim, values]) => !values || values.length === 0 || alertCovers(dictionary, alert, dim as Dim, values));
}

function regionOf(dictionary: Dictionary, query: MetricQuery): Region | null {
  const pinned = Object.entries(query.filters).filter(([, values]) => values?.length === 1).map(([dim, values]) => [dim, (values as string[])[0]]);
  return geoValueOf(dictionary, Object.fromEntries(pinned), "region") as Region | null;
}

function titleOf(query: MetricQuery, result: Extract<MetricResult, { ok: true }>): string {
  const top = result.headline.top[0];
  return top ? `${metricLabel(query.metric)} · ${top.label}` : metricLabel(query.metric);
}

/** The buttons a metric card offers, decided from the result, the open alerts on that slice and how often it was asked. */
export function actionsForMetric(access: AccessContext, query: MetricQuery, result: MetricResult, dictionary: Dictionary): NextAction[] {
  if (!result.ok) return [];
  const alert = openAlertsFor(access).find((entry) => matchesQuery(dictionary, entry, query)) ?? null;
  const actions = nextActionsFor(
    access,
    {
      title: titleOf(query, result),
      query,
      deltaPercent: result.headline.deltaPercent,
      masked: result.provenance.masked,
      topLabel: sharpestHarm(query, result, HARM_MIN_PCT)?.label ?? null,
      alertIds: alert ? [alert.id] : [],
      alertScope: alert ? alertScopeLabel(alert, dictionary) : null,
      verifyStep: alert ? alert.verifySteps[0] : null,
      region: regionOf(dictionary, query),
      drawnAs: widgetKindFor(query, result),
    },
    alreadyPinned(access.userId, query) ? 0 : repeatsOf(access.userId, query),
  );
  return withoutRepeatHandoff(actions, alert ? [alert.id] : []);
}

/** The buttons an anomaly card offers: hand the top alert to its owner, or verify it first. */
export function actionsForAlert(access: AccessContext, alert: Alert | null, dictionary: Dictionary): NextAction[] {
  if (!alert) return [];
  const query: MetricQuery = {
    metric: alert.metric,
    dims: [],
    filters: Object.fromEntries(Object.entries(alert.dims).map(([dim, value]) => [dim, [value as string]])),
    range: alert.window,
    grain: "day",
    compare: "prev_period",
    limit: 1,
  };
  const scope = alertScopeLabel(alert, dictionary);
  const actions = nextActionsFor(access, {
    title: scope,
    query,
    deltaPercent: alert.expected === 0 ? null : ((alert.observed - alert.expected) / Math.abs(alert.expected)) * PERCENT,
    masked: [],
    topLabel: scope,
    alertIds: [alert.id],
    alertScope: scope,
    verifyStep: alert.verifySteps[0],
    region: regionOf(dictionary, query),
  });
  return withoutRepeatHandoff(actions, [alert.id]);
}

/** The follow-up questions the chat offers under the composer after this result, minus what the card already offers. */
export function followUpsForMetric(access: AccessContext, query: MetricQuery, result: MetricResult, cardActions: readonly NextAction[]): QuickAction[] {
  if (!result.ok) return [];
  const taken = cardActions.map((action) => action.prompt).filter((prompt): prompt is string => prompt !== null);
  return followUpsFor(access, { query, result, taken }, learnedKindShare(actionEvents().all(), access.userId));
}
