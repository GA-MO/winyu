import type { AccessContext, Alert, Dim, MetricQuery, MetricResult, NextAction, QuickAction, Region, ResolvedQuery } from "@/lib/contracts";
import { verifyStepsFor } from "@/lib/access/verify-steps";
import { widgetKindFor } from "@/lib/cards/present";
import { alertFocus, alertForAnswer, cardFocus } from "@/lib/cards/focus";
import { regionOfSlice, sliceCovers } from "@/lib/semantic/geo";
import { namesOf, type Dictionary } from "@/lib/semantic/dictionary";
import { effectiveFilters, pinnedSlice } from "@/lib/semantic/resolved";
import { nextActionsFor } from "@/lib/engine/next-actions";
import { followUpsFor, learnedKindShare } from "@/lib/engine/follow-ups";
import { openAlertsFor, openPacketCarrying } from "@/lib/server/alerts";
import { actionEvents, layouts } from "@/lib/server/agent/collections";
import { isPinnedSlice } from "@/lib/engine/compose";
import { intentKeyOf } from "@/lib/server/threads";

const PERCENT = 100;
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

/** The open alert a card is about: of the viewer's open alerts on the same metric inside every slice the answer is narrowed to, the one on the row the answer points at (`alertForAnswer`). */
function alertInQuestion(access: AccessContext, result: Extract<MetricResult, { ok: true }>, dictionary: Dictionary): Alert | null {
  const { query } = result;
  const slice = effectiveFilters(query);
  return alertForAnswer(result, openAlertsFor(access).filter((alert) => alert.metric === query.metric && sliceCovers(dictionary, slice, alert.dims)), dictionary);
}

/** The region a card's work belongs to: the one its slice is pinned to, else the region of the alert it is about; null for the whole country. */
function regionOf(dictionary: Dictionary, query: ResolvedQuery, alert: Alert | null): Region | null {
  return regionOfSlice(dictionary, pinnedSlice(effectiveFilters(query))) ?? (alert ? regionOfSlice(dictionary, alert.dims) : null);
}

/** The buttons a metric card offers, decided from the resolved question, the open alerts on that slice and how often it was asked. */
export function actionsForMetric(access: AccessContext, result: MetricResult, dictionary: Dictionary): NextAction[] {
  if (!result.ok) return [];
  const { query } = result;
  const alert = alertInQuestion(access, result, dictionary);
  const actions = nextActionsFor(
    access,
    {
      query,
      focus: cardFocus(result, alert, dictionary),
      deltaPercent: result.headline.deltaPercent,
      masked: result.provenance.masked,
      alertIds: alert ? [alert.id] : [],
      verifyStep: alert ? (verifyStepsFor(access, alert)[0] ?? null) : null,
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
  const actions = nextActionsFor(access, {
    query: alertQueryOf(alert, dictionary),
    focus: alertFocus(alert, dictionary),
    deltaPercent: alert.expected === 0 ? null : ((alert.observed - alert.expected) / Math.abs(alert.expected)) * PERCENT,
    masked: [],
    alertIds: [alert.id],
    verifyStep: verifyStepsFor(access, alert)[0] ?? null,
    region: regionOfSlice(dictionary, alert.dims),
  });
  return withoutRepeatHandoff(actions, [alert.id]);
}

/** The follow-up questions the chat offers under the composer after this result, about the row the card is about, minus what the card already offers. */
export function followUpsForMetric(access: AccessContext, result: MetricResult, dictionary: Dictionary, cardActions: readonly NextAction[]): QuickAction[] {
  if (!result.ok) return [];
  const taken = cardActions.map((action) => action.prompt).filter((prompt): prompt is string => prompt !== null);
  const { row } = cardFocus(result, alertInQuestion(access, result, dictionary), dictionary);
  return followUpsFor(access, { query: result.query, result, focus: row, taken }, learnedKindShare(actionEvents().all(), access.userId));
}
