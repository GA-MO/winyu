import type { AccessContext, Alert, MetricId, MetricQuery } from "@/lib/contracts";
import type { Spec, SpecElement } from "vexa/protocol";
import { runMetric } from "@/lib/data/query";
import { TODAY, addDays, formatThaiDate } from "@/lib/data/dates";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { templateFor } from "@/lib/dashboard/templates";
import { TH } from "@/lib/i18n/th";
import { openAlertsFor, openPacketsFor } from "./alerts";

const TOP_ALERTS = 3;
const MOVE_THRESHOLD = 5;
const MAX_MOVES = 3;
const ATTAINMENT_DAYS = 27;

export type BriefMove = { label: string; deltaPct: number; metric: MetricId };
export type MorningBrief = { line: string; bullets: string[]; attainment: number | null; alerts: Alert[]; moves: BriefMove[]; spec: Spec };

function attainmentQuery(): MetricQuery {
  return {
    metric: "target_attainment",
    dims: [],
    filters: {},
    range: { from: addDays(TODAY, -ATTAINMENT_DAYS), to: TODAY },
    grain: "day",
    compare: "none",
    limit: 1,
  };
}

function attainmentOf(access: AccessContext): number | null {
  if (access.metricAcl.target_attainment !== "full") return null;
  const result = runMetric(attainmentQuery(), access);
  if (!result.ok) return null;
  const value = result.rows[0]?.value;
  return typeof value === "number" ? value : null;
}

function movesFor(access: AccessContext): BriefMove[] {
  const moves: BriefMove[] = [];
  for (const seed of templateFor(access).slice(0, MAX_MOVES + 2)) {
    if (moves.length >= MAX_MOVES) break;
    const result = runMetric({ ...seed.query, dims: [], compare: "prev_period", limit: 1 }, access);
    if (!result.ok) continue;
    const delta = result.rows[0]?.delta_pct;
    if (typeof delta !== "number" || Math.abs(delta) < MOVE_THRESHOLD) continue;
    moves.push({ label: seed.title, deltaPct: delta, metric: seed.query.metric });
  }
  return moves;
}

function element(type: string, props: Record<string, unknown>, children: string[] = []): SpecElement {
  return { type, props, children } as SpecElement;
}

function specOf(bullets: string[], line: string): Spec {
  const elements: Record<string, SpecElement> = {
    brief: element(
      "Card",
      { title: TH.brief.title, meta: formatThaiDate(TODAY), description: line, footnote: null },
      ["brief-list"],
    ),
    "brief-list": element("List", { items: bullets, ordered: true }),
  };
  return { root: "brief", elements };
}

/** What Cop opens with: the alerts it found, what moved, and what is waiting for this user. */
export function morningBriefFor(access: AccessContext): MorningBrief {
  const alerts = openAlertsFor(access).slice(0, TOP_ALERTS);
  const packets = openPacketsFor(access);
  const attainment = attainmentOf(access);
  const moves = movesFor(access);
  const bullets: string[] = [];
  for (const alert of alerts) bullets.push(`${TH.severity[alert.severity]} · ${metricLabel(alert.metric)} — ${alert.hypothesis}`);
  if (attainment !== null) bullets.push(TH.brief.attainment(attainment));
  for (const move of moves) bullets.push(TH.brief.moved(move.label, move.deltaPct));
  if (packets.length > 0) bullets.push(TH.brief.packets(packets.length));

  const parts: string[] = [];
  if (alerts.length > 0) parts.push(TH.brief.alerts(openAlertsFor(access).length));
  if (packets.length > 0) parts.push(TH.brief.packets(packets.length));
  const line = parts.length === 0 ? TH.brief.quiet : `${parts.join(TH.brief.join)}${TH.brief.suffix}`;
  return { line, bullets, attainment, alerts, moves, spec: specOf(bullets, line) };
}

export type DashboardChange = { label: string; deltaPct: number | null; metric: MetricId | null };

/** What is different on this dashboard since yesterday, as chips: new alerts, new replies, the metrics that moved. */
export function changesSince(access: AccessContext): DashboardChange[] {
  const yesterday = addDays(TODAY, -1);
  const fresh = openAlertsFor(access).filter((alert) => alert.at.slice(0, 10) >= yesterday);
  const replied = openPacketsFor(access).filter((packet) => packet.thread.length > 0 && packet.updatedAt.slice(0, 10) >= yesterday);
  const changes: DashboardChange[] = [];
  if (fresh.length > 0) changes.push({ label: TH.brief.newAlerts(fresh.length), deltaPct: null, metric: null });
  if (replied.length > 0) changes.push({ label: TH.brief.newReplies(replied.length), deltaPct: null, metric: null });
  for (const move of movesFor(access)) changes.push({ label: move.label, deltaPct: move.deltaPct, metric: move.metric });
  return changes;
}
