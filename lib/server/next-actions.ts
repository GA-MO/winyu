import type { AccessContext, Alert, MetricQuery, MetricResult, NextAction, QuickAction } from "@/lib/contracts";
import { nextActionsFor } from "@/lib/engine/next-actions";
import { followUpsFor, learnedKindShare } from "@/lib/engine/follow-ups";
import { alertScopeLabel } from "@/lib/cards/alert-row";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { openAlertsFor } from "@/lib/server/alerts";
import { actionEvents, layouts } from "@/lib/server/agent/collections";
import { isPinnedSlice } from "@/lib/engine/compose";
import { intentKeyOf } from "@/lib/server/threads";

const PERCENT = 100;
const REPEAT_DAYS = 30;
const DAY_MS = 86_400_000;

function repeatsOf(userId: string, query: MetricQuery, now = Date.now()): number {
  const key = intentKeyOf(query.metric, query.dims);
  return actionEvents().where(
    (event) => event.userId === userId && event.intentKey === key && now - new Date(event.at).getTime() <= REPEAT_DAYS * DAY_MS,
  ).length;
}

function alreadyPinned(userId: string, query: MetricQuery): boolean {
  return isPinnedSlice(layouts().get(userId)?.widgets ?? [], query);
}

function matchesQuery(alert: Alert, query: MetricQuery): boolean {
  if (alert.metric !== query.metric) return false;
  return Object.entries(query.filters).every(([dim, values]) => {
    const scope = alert.dims[dim as keyof typeof alert.dims];
    return !values || values.length === 0 || !scope || values.includes(scope);
  });
}

function titleOf(query: MetricQuery, result: Extract<MetricResult, { ok: true }>): string {
  const top = result.headline.top[0];
  return top ? `${metricLabel(query.metric)} · ${top.label}` : metricLabel(query.metric);
}

/** The buttons a metric card offers, decided from the result, the open alerts on that slice and how often it was asked. */
export function actionsForMetric(access: AccessContext, query: MetricQuery, result: MetricResult): NextAction[] {
  if (!result.ok) return [];
  const alert = openAlertsFor(access).find((entry) => matchesQuery(entry, query)) ?? null;
  return nextActionsFor(
    access,
    {
      title: titleOf(query, result),
      query,
      deltaPercent: result.headline.deltaPercent,
      masked: result.provenance.masked,
      topLabel: result.headline.top[0]?.label ?? null,
      alertIds: alert ? [alert.id] : [],
      alertScope: alert ? alertScopeLabel(alert) : null,
      verifyStep: alert ? alert.verifySteps[0] : null,
    },
    alreadyPinned(access.userId, query) ? 0 : repeatsOf(access.userId, query),
  );
}

/** The buttons an anomaly card offers: hand the top alert to its owner, or verify it first. */
export function actionsForAlert(access: AccessContext, alert: Alert | null): NextAction[] {
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
  return nextActionsFor(access, {
    title: alertScopeLabel(alert),
    query,
    deltaPercent: alert.expected === 0 ? null : ((alert.observed - alert.expected) / Math.abs(alert.expected)) * PERCENT,
    masked: [],
    topLabel: alertScopeLabel(alert),
    alertIds: [alert.id],
    alertScope: alertScopeLabel(alert),
    verifyStep: alert.verifySteps[0],
  });
}

/** The follow-up questions the chat offers under the composer after this result, minus what the card already offers. */
export function followUpsForMetric(access: AccessContext, query: MetricQuery, result: MetricResult, cardActions: readonly NextAction[]): QuickAction[] {
  if (!result.ok) return [];
  const taken = cardActions.map((action) => action.prompt).filter((prompt): prompt is string => prompt !== null);
  return followUpsFor(access, { query, result, taken }, learnedKindShare(actionEvents().all(), access.userId));
}
