import type { AccessContext, Alert, MetricId, MetricQuery } from "@/lib/contracts";
import { runMetric } from "@/lib/server/metrics";
import { TODAY, addDays } from "@/lib/data/dates";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { templateFor } from "@/lib/dashboard/templates";
import { TH } from "@/lib/i18n/th";
import { openAlertsFor, openPacketsFor } from "./alerts";

const TOP_ALERTS = 3;
const MOVE_THRESHOLD = 5;
const MAX_MOVES = 3;
const ATTAINMENT_DAYS = 27;

export type BriefMove = { label: string; deltaPct: number; metric: MetricId };
export type MorningBrief = { line: string; bullets: string[]; attainment: number | null; alerts: Alert[]; moves: BriefMove[] };

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

async function attainmentOf(access: AccessContext): Promise<number | null> {
  if (access.metricAcl.target_attainment !== "full") return null;
  const result = await runMetric(attainmentQuery(), access);
  if (!result.ok) return null;
  const value = result.rows[0]?.value;
  return typeof value === "number" ? value : null;
}

async function movesFor(access: AccessContext): Promise<BriefMove[]> {
  const moves: BriefMove[] = [];
  for (const seed of templateFor(access).slice(0, MAX_MOVES + 2)) {
    if (moves.length >= MAX_MOVES) break;
    const result = await runMetric({ ...seed.query, dims: [], compare: "prev_period", limit: 1 }, access);
    if (!result.ok) continue;
    const delta = result.rows[0]?.delta_pct;
    if (typeof delta !== "number" || Math.abs(delta) < MOVE_THRESHOLD) continue;
    moves.push({ label: seed.title, deltaPct: delta, metric: seed.query.metric });
  }
  return moves;
}

/** What Winyu opens with: the alerts it found, what moved, and what is waiting for this user. */
export async function morningBriefFor(access: AccessContext): Promise<MorningBrief> {
  const alerts = openAlertsFor(access).slice(0, TOP_ALERTS);
  const packets = openPacketsFor(access);
  const [attainment, moves] = await Promise.all([attainmentOf(access), movesFor(access)]);
  const bullets: string[] = [];
  for (const alert of alerts) bullets.push(`${TH.severity[alert.severity]} · ${metricLabel(alert.metric)} — ${alert.hypothesis}`);
  if (attainment !== null) bullets.push(TH.brief.attainment(attainment));
  for (const move of moves) bullets.push(TH.brief.moved(move.label, move.deltaPct));
  if (packets.length > 0) bullets.push(TH.brief.packets(packets.length));

  const parts: string[] = [];
  if (alerts.length > 0) parts.push(TH.brief.alerts(openAlertsFor(access).length));
  if (packets.length > 0) parts.push(TH.brief.packets(packets.length));
  const line = parts.length === 0 ? TH.brief.quiet : `${parts.join(TH.brief.join)}${TH.brief.suffix}`;
  return { line, bullets, attainment, alerts, moves };
}

