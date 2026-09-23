"use client";

import type { ComponentRegistry } from "@json-render/react";
import type { AlertRow, MetricQuery, MetricResult, NextAction } from "@/lib/contracts";
import { presentAlerts, presentCard, type CardBody, type CardView, type PresentSource, type SignalItem, type SortBy } from "@/lib/cards/present";
import { TH } from "@/lib/i18n/th";
import { ActionStrip, CardPartsView } from "./card-parts";
import { CardBodyView } from "./charts/card-body";
import { SignalList } from "./signal-list";

export type MetricAnswer = Extract<MetricResult, { ok: true }> & { query: MetricQuery; nextActions: NextAction[] };

type AlertAnswer = { ok?: boolean; rows?: AlertRow[]; nextActions?: NextAction[] };

type DataCardProps = { title: string; source?: unknown; with?: unknown; view?: CardView | null; sortBy?: SortBy | null; description?: string | null };

type AlertsCardProps = { title: string; source?: unknown; description?: string | null };

function metricAnswerOf(source: unknown): MetricAnswer | null {
  if (typeof source !== "object" || source === null) return null;
  const candidate = source as Partial<MetricAnswer>;
  if (candidate.ok !== true || !candidate.query || !Array.isArray(candidate.rows) || !candidate.headline) return null;
  return candidate as MetricAnswer;
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

/** The model names a card and points it at a tool result; Cop's presenter decides everything else. */
export function DataCard({ props }: { props: DataCardProps }) {
  const answer = metricAnswerOf(props.source);
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

export function AlertsCard({ props }: { props: AlertsCardProps }) {
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

function signalsOf(props: unknown): SignalItem[] {
  const items = (props as { items?: unknown }).items;
  return Array.isArray(items) ? (items as SignalItem[]) : [];
}

function actionStripOf(props: unknown): NextAction[] {
  const actions = (props as { actions?: unknown }).actions;
  return Array.isArray(actions) ? (actions as NextAction[]) : [];
}

function cardBodyOf(props: unknown): CardBody {
  const body = (props as { body?: CardBody }).body;
  return body ?? { kind: "none" };
}

export const COP_CARD_COMPONENTS: ComponentRegistry = {
  DataCard: ({ element }) => <DataCard props={element.props as never} />,
  AlertsCard: ({ element }) => <AlertsCard props={element.props as never} />,
  ActionStrip: ({ element }) => <ActionStrip actions={actionStripOf(element.props)} />,
  SignalList: ({ element }) => <SignalList items={signalsOf(element.props)} />,
  CardBody: ({ element }) => <CardBodyView body={cardBodyOf(element.props)} />,
};
