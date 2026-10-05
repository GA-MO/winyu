import { METRIC_IDS, type AlertRow, type MetricId, type MetricQuery, type MetricResult, type NextAction } from "@/lib/contracts";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";
import { presentAlerts, presentCard, presentForecast, type CardParts, type ForecastAnswer, type PresentSource, type RefusalNotice, refusalNoticeOf } from "./present";

/** A query_metric result as its card reads it: the rows and headline, the query that made them, and what the card offers next. */
export type MetricAnswer = Extract<MetricResult, { ok: true }> & { query: MetricQuery; nextActions: NextAction[] };

type AlertAnswer = { ok?: boolean; rows?: AlertRow[]; nextActions?: NextAction[] };

export function metricAnswerOf(source: unknown): MetricAnswer | null {
  if (typeof source !== "object" || source === null) return null;
  const candidate = source as Partial<MetricAnswer>;
  if (candidate.ok !== true || !candidate.query || !Array.isArray(candidate.rows) || !candidate.headline) return null;
  return candidate as MetricAnswer;
}

/** The refusal a tool returned (`ok: false` with its reason) as the person reads it, or null when it answered. */
export function refusalOf(source: unknown): RefusalNotice | null {
  if (typeof source !== "object" || source === null) return null;
  const { ok, error, code } = source as { ok?: unknown; error?: unknown; code?: unknown };
  return ok === false && typeof error === "string" ? refusalNoticeOf(code, error) : null;
}

export function deniedParts(title: string, denied: RefusalNotice): CardParts {
  return { title, meta: null, description: null, footnote: null, hero: null, body: { kind: "none" }, actions: [], denied };
}

export function forecastOf(source: unknown, history: MetricAnswer | null): ForecastAnswer | null {
  if (Array.isArray(source)) {
    return history ? { metric: history.query.metric, total: null, mape: null, weeks: source as ForecastAnswer["weeks"] } : null;
  }
  if (typeof source !== "object" || source === null) return null;
  const candidate = source as Partial<ForecastAnswer>;
  if (!candidate.metric || !Array.isArray(candidate.weeks)) return null;
  return { metric: candidate.metric, total: candidate.total ?? null, mape: candidate.mape ?? null, weeks: candidate.weeks };
}

export function alertsOf(source: unknown): AlertRow[] {
  if (typeof source !== "object" || source === null) return [];
  const rows = (source as AlertAnswer).rows;
  return Array.isArray(rows) ? rows : [];
}

export function actionsOf(source: unknown): NextAction[] {
  if (typeof source !== "object" || source === null) return [];
  const actions = (source as AlertAnswer).nextActions;
  return Array.isArray(actions) ? actions : [];
}

export function othersOf(bindings: unknown): PresentSource[] {
  if (!Array.isArray(bindings)) return [];
  return bindings.flatMap((binding) => {
    const answer = metricAnswerOf(binding);
    return answer ? [{ query: answer.query, result: answer }] : [];
  });
}

function metricOf(value: unknown): MetricId | null {
  const metric = typeof value === "object" && value !== null ? (value as { metric?: unknown }).metric : null;
  return METRIC_IDS.includes(metric as MetricId) ? (metric as MetricId) : null;
}

/** A query_metric card's title: the metric's name, from the result's query or else the call's arguments. */
export function metricTitle(result: unknown, args: unknown): string {
  const metric = metricOf((result as { query?: unknown } | null)?.query) ?? metricOf(args);
  return metric ? metricLabel(metric) : TH.cards.unreadable;
}

export function forecastTitle(result: unknown, args: unknown): string {
  const metric = metricOf(result) ?? metricOf(args);
  return metric ? TH.cards.forecastTitle(metricLabel(metric)) : TH.cards.unreadable;
}

function metricParts(result: unknown, args: unknown): CardParts | null {
  const title = metricTitle(result, args);
  const refusal = refusalOf(result);
  if (refusal) return deniedParts(title, refusal);
  const answer = metricAnswerOf(result);
  return answer ? presentCard({ title, query: answer.query, result: answer, view: "auto", actions: answer.nextActions }) : null;
}

function alertParts(result: unknown): CardParts | null {
  const alerts = alertsOf(result);
  return alerts.length > 0 ? presentAlerts({ title: TH.cards.alertsTitle, alerts, description: null, actions: actionsOf(result) }) : null;
}

function forecastParts(result: unknown, args: unknown): CardParts | null {
  const forecast = forecastOf(result, null);
  return forecast ? presentForecast({ title: forecastTitle(result, args), forecast, history: null, description: null }) : null;
}

const PARTS_OF_TOOL: Record<string, (result: unknown, args: unknown) => CardParts | null> = {
  query_metric: metricParts,
  get_alerts: alertParts,
  get_forecast: forecastParts,
};

/** The card parts a bound tool result draws as outside the chat (DataCard, alerts, forecast), the same decision table the chat card uses; null for a tool whose card is not bound to its result. */
export function toolCardParts(tool: string, result: unknown, args: unknown): CardParts | null {
  return PARTS_OF_TOOL[tool]?.(result, args) ?? null;
}
