import type { AccessContext, Alert, Dim, MetricQuery, MetricResult, NextAction, QuickAction, Region, ResolvedQuery } from "@/lib/contracts";
import { widgetKindFor } from "@/lib/cards/present";
import { regionOfSlice, sliceCovers } from "@/lib/semantic/geo";
import { namesOf, type Dictionary } from "@/lib/semantic/dictionary";
import { effectiveFilters, pinnedSlice } from "@/lib/semantic/resolved";
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

/** The open alert a card is about: the viewer's first open alert on the same metric inside every slice the answer is narrowed to. */
function alertInQuestion(access: AccessContext, query: ResolvedQuery, dictionary: Dictionary): Alert | null {
  const slice = effectiveFilters(query);
  return openAlertsFor(access).find((alert) => alert.metric === query.metric && sliceCovers(dictionary, slice, alert.dims)) ?? null;
}

/** The region a card's work belongs to: the one its slice is pinned to, else the region of the alert it is about; null for the whole country. */
function regionOf(dictionary: Dictionary, query: ResolvedQuery, alert: Alert | null): Region | null {
  return regionOfSlice(dictionary, pinnedSlice(effectiveFilters(query))) ?? (alert ? regionOfSlice(dictionary, alert.dims) : null);
}

function titleOf(query: MetricQuery, result: Extract<MetricResult, { ok: true }>): string {
  const top = result.headline.top[0];
  return top ? `${metricLabel(query.metric)} · ${top.label}` : metricLabel(query.metric);
}

/** The buttons a metric card offers, decided from the resolved question, the open alerts on that slice and how often it was asked. */
export function actionsForMetric(access: AccessContext, result: MetricResult, dictionary: Dictionary): NextAction[] {
  if (!result.ok) return [];
  const { query } = result;
  const alert = alertInQuestion(access, query, dictionary);
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
      region: regionOf(dictionary, query, alert),
      drawnAs: widgetKindFor(query, result),
    },
    alreadyPinned(access.userId, query) ? 0 : repeatsOf(access.userId, query),
  );
  return withoutRepeatHandoff(actions, alert ? [alert.id] : []);
}

function alertQueryOf(alert: Alert, dictionary: Dictionary): ResolvedQuery {
  const filters = Object.fromEntries(Object.entries(alert.dims).map(([dim, id]) => [dim, [id as string]])) as Partial<Record<Dim, string[]>>;
  return { metric: alert.metric, dims: [], filters, range: alert.window, grain: "day", compare: "prev_period", limit: 1, scopeApplied: {}, labels: namesOf(dictionary, filters) };
}

/** The buttons an anomaly card offers: hand the alert to its owner, or verify it first. */
export function actionsForAlert(access: AccessContext, alert: Alert | null, dictionary: Dictionary): NextAction[] {
  if (!alert) return [];
  const query = alertQueryOf(alert, dictionary);
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
    region: regionOfSlice(dictionary, alert.dims),
  });
  return withoutRepeatHandoff(actions, [alert.id]);
}

/** The follow-up questions the chat offers under the composer after this result, minus what the card already offers. */
export function followUpsForMetric(access: AccessContext, result: MetricResult, cardActions: readonly NextAction[]): QuickAction[] {
  if (!result.ok) return [];
  const taken = cardActions.map((action) => action.prompt).filter((prompt): prompt is string => prompt !== null);
  return followUpsFor(access, { query: result.query, result, taken }, learnedKindShare(actionEvents().all(), access.userId));
}
