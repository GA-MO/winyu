"use client";

import type { AlertRow, MetricQuery, MetricResult, NextAction } from "@/lib/contracts";
import { presentAlerts, presentCard, presentForecast, type CardParts, type ForecastAnswer, type CardView, type PresentSource, type SortBy } from "@/lib/cards/present";
import { TH } from "@/lib/i18n/th";
import { CardPartsView } from "./card-parts";

export type MetricAnswer = Extract<MetricResult, { ok: true }> & { query: MetricQuery; nextActions: NextAction[] };

type AlertAnswer = { ok?: boolean; rows?: AlertRow[]; nextActions?: NextAction[] };

type DataCardProps = { title: string; source: unknown; with?: unknown; view?: CardView | null; sortBy?: SortBy | null; description?: string | null };

type AlertsCardProps = { title: string; source: unknown; description?: string | null };

type ForecastCardProps = { title: string; source: unknown; history?: unknown; description?: string | null };

function metricAnswerOf(source: unknown): MetricAnswer | null {
  if (typeof source !== "object" || source === null) return null;
  const candidate = source as Partial<MetricAnswer>;
  if (candidate.ok !== true || !candidate.query || !Array.isArray(candidate.rows) || !candidate.headline) return null;
  return candidate as MetricAnswer;
}

function refusalOf(source: unknown): string | null {
  if (typeof source !== "object" || source === null) return null;
  const { ok, error } = source as { ok?: unknown; error?: unknown };
  return ok === false && typeof error === "string" ? error : null;
}

function deniedParts(title: string, denied: string): CardParts {
  return { title, meta: null, description: null, footnote: null, hero: null, body: { kind: "none" }, actions: [], denied };
}

function forecastOf(source: unknown, history: MetricAnswer | null): ForecastAnswer | null {
  if (Array.isArray(source)) {
    return history ? { metric: history.query.metric, total: null, mape: null, weeks: source as ForecastAnswer["weeks"] } : null;
  }
  if (typeof source !== "object" || source === null) return null;
  const candidate = source as Partial<ForecastAnswer>;
  if (!candidate.metric || !Array.isArray(candidate.weeks)) return null;
  return { metric: candidate.metric, total: candidate.total ?? null, mape: candidate.mape ?? null, weeks: candidate.weeks };
}

function alertsOf(source: unknown): AlertRow[] {
  if (typeof source !== "object" || source === null) return [];
  const rows = (source as AlertAnswer).rows;
  return Array.isArray(rows) ? rows : [];
}

function actionsOf(source: unknown): NextAction[] {
  if (typeof source !== "object" || source === null) return [];
  const actions = (source as AlertAnswer).nextActions;
  return Array.isArray(actions) ? actions : [];
}

function othersOf(bindings: unknown): PresentSource[] {
  if (!Array.isArray(bindings)) return [];
  return bindings.flatMap((binding) => {
    const answer = metricAnswerOf(binding);
    return answer ? [{ query: answer.query, result: answer }] : [];
  });
}

function Pending({ title }: { title: string }) {
  return (
    <section className="w-full rounded-2xl border border-dashed border-border bg-card/60 p-4">
      <p className="text-[15px] font-semibold tracking-tight">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{TH.dash.waiting}</p>
    </section>
  );
}

/** A raw query_metric result drawn as a card; the presenter decides the body, the scope line and the next actions. */
export function DataCard(props: DataCardProps) {
  const answer = metricAnswerOf(props.source);
  const refusal = refusalOf(props.source);
  if (refusal) return <CardPartsView parts={deniedParts(props.title, refusal)} />;
  if (!answer) return <Pending title={props.title} />;
  const parts = presentCard({
    title: props.title,
    query: answer.query,
    result: answer,
    view: props.view ?? "auto",
    sortBy: props.sortBy ?? null,
    description: props.description ?? null,
    actions: answer.nextActions,
    others: othersOf(props.with),
  });
  return <CardPartsView parts={parts} />;
}

/** A get_alerts result: one signal row per anomaly, the gap as the big number. */
export function AlertsCard(props: AlertsCardProps) {
  const alerts = alertsOf(props.source);
  if (alerts.length === 0) return <Pending title={props.title} />;
  return (
    <CardPartsView
      parts={presentAlerts({
        title: props.title,
        alerts,
        description: props.description ?? null,
        actions: actionsOf(props.source),
      })}
    />
  );
}

/** A get_forecast answer, with the weekly actuals when they are given: the line, the band and the error caption. */
export function ForecastCard(props: ForecastCardProps) {
  const history = metricAnswerOf(props.history);
  const forecast = forecastOf(props.source, history);
  if (!forecast) return <Pending title={props.title} />;
  return (
    <CardPartsView
      parts={presentForecast({
        title: props.title,
        forecast,
        history: history ? { query: history.query, result: history } : null,
        description: props.description ?? null,
      })}
    />
  );
}
