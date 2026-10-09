"use client";

import { presentAlerts, presentCard, presentForecast, type CardView, type LockedRows, type SortBy } from "@/lib/cards/present";
import { actionsOf, alertsOf, deniedParts, forecastOf, metricAnswerOf, othersOf, refusalOf } from "@/lib/cards/tool-answers";
import { TH } from "@/lib/i18n/th";
import { CardPartsView } from "./card-parts";

type DataCardProps = { title: string; source: unknown; with?: unknown; view?: CardView | null; sortBy?: SortBy | null; description?: string | null; locked?: LockedRows | null };

type AlertsCardProps = { title: string; source: unknown; description?: string | null };

type ForecastCardProps = { title: string; source: unknown; history?: unknown; description?: string | null };

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
    locked: props.locked ?? null,
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
