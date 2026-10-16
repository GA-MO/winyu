"use client";

import type { ReactNode } from "react";
import { forecastTitle, metricTitle } from "@/lib/cards/tool-answers";
import { TH } from "@/lib/i18n/th";
import { AlertsCard, DataCard, ForecastCard } from "./data-card";
import { CandidatesCard, CoursesCard, PolicyCard } from "./entity/hr";
import { OwnerCard, PeopleCard, PersonCard } from "./entity/people";
import { CalendarCard, connectorCard, EntityCard, GapCard, MemoryCard, MetricsListCard } from "./entity/reference";
import { SiteCard } from "./entity/sites";
import { AdminAuditCard } from "./entity/admin-audit";

/** Draws one tool result; `args` is what the model called the tool with, `paired` the other answers of the turn its card draws with it (R10). */
export type ToolCard = (result: unknown, args: unknown, paired: readonly unknown[]) => ReactNode;

const CrmVisitsCard = connectorCard("store_visits");
const LmsTrainingCard = connectorCard("training_history");
const LogisticsPartnerCard = connectorCard("ask_logistics_partner");
const InboxCard = connectorCard("inbox");
const VisitPlanCard = connectorCard("visit_plan");

/** Every read tool's card, keyed by tool name: the model picks the tool, the card is drawn from its result. */
export const TOOL_CARDS = {
  query_metric: (result, args, paired) => <DataCard title={metricTitle(result, args)} source={result} with={paired} />,
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
  store_visits: (result) => <CrmVisitsCard result={result} />,
  training_history: (result) => <LmsTrainingCard result={result} />,
  ask_logistics_partner: (result) => <LogisticsPartnerCard result={result} />,
  inbox: (result) => <InboxCard result={result} />,
  visit_plan: (result) => <VisitPlanCard result={result} />,
  admin_audit: (result) => <AdminAuditCard result={result} />,
} satisfies Record<string, ToolCard>;

export type CardToolName = keyof typeof TOOL_CARDS;
