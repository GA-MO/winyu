"use client";

import type { ReactNode } from "react";
import { METRIC_IDS, type MetricId } from "@/lib/contracts";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";
import { AlertsCard, DataCard, ForecastCard } from "./data-card";
import { CandidatesCard, CoursesCard, PolicyCard } from "./entity/hr";
import { OwnerCard, PeopleCard, PersonCard } from "./entity/people";
import { CalendarCard, connectorCard, EntityCard, GapCard, MemoryCard, MetricsListCard } from "./entity/reference";
import { SiteCard } from "./entity/sites";

/** Draws one tool result; `args` is what the model called the tool with. */
export type ToolCard = (result: unknown, args: unknown) => ReactNode;

const CrmVisitsCard = connectorCard("store_visits");
const LmsTrainingCard = connectorCard("training_history");
const LogisticsPartnerCard = connectorCard("ask_logistics_partner");

function metricOf(value: unknown): MetricId | null {
  const metric = typeof value === "object" && value !== null ? (value as { metric?: unknown }).metric : null;
  return METRIC_IDS.includes(metric as MetricId) ? (metric as MetricId) : null;
}

function metricTitle(result: unknown, args: unknown): string {
  const metric = metricOf((result as { query?: unknown } | null)?.query) ?? metricOf(args);
  return metric ? metricLabel(metric) : TH.cards.unreadable;
}

function forecastTitle(result: unknown, args: unknown): string {
  const metric = metricOf(result) ?? metricOf(args);
  return metric ? TH.cards.forecastTitle(metricLabel(metric)) : TH.cards.unreadable;
}

/** Every read tool's card, keyed by tool name: the model picks the tool, the card is drawn from its result. */
export const TOOL_CARDS = {
  query_metric: (result, args) => <DataCard title={metricTitle(result, args)} source={result} />,
  get_alerts: (result) => <AlertsCard title={TH.cards.alertsTitle} source={result} />,
  get_forecast: (result, args) => <ForecastCard title={forecastTitle(result, args)} source={result} />,
  explain_gap: (result) => <GapCard result={result} />,
  get_calendar: (result) => <CalendarCard result={result} />,
  find_people: (result) => <PeopleCard result={result} />,
  get_person: (result) => <PersonCard result={result} />,
  get_site: (result) => <SiteCard result={result} />,
  list_candidates: (result) => <CandidatesCard result={result} />,
  list_courses: (result) => <CoursesCard result={result} />,
  get_policy: (result) => <PolicyCard result={result} />,
  describe_entity: (result) => <EntityCard result={result} />,
  resolve_owner: (result) => <OwnerCard result={result} />,
  recall_memory: (result) => <MemoryCard result={result} />,
  list_metrics: (result) => <MetricsListCard result={result} />,
  crm_demo__store_visits: (result) => <CrmVisitsCard result={result} />,
  lms_demo__training_history: (result) => <LmsTrainingCard result={result} />,
  ask_logistics_partner: (result) => <LogisticsPartnerCard result={result} />,
} satisfies Record<string, ToolCard>;

export type CardToolName = keyof typeof TOOL_CARDS;
