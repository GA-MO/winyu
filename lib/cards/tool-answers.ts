import { METRIC_IDS, type AlertRow, type Dim, type MetricId, type MetricResult, type MonthEndProjection, type NextAction } from "@/lib/contracts";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";
import { isTimeDim } from "./rows";
import { type CardParts, type ForecastAnswer, pairedIndexes, type PresentSource, type RefusalNotice, refusalNoticeOf } from "./present";

/** A query_metric result as its card reads it: the rows and headline, the query that made them, and what the card offers next. */
export type MetricAnswer = Extract<MetricResult, { ok: true }> & { nextActions: NextAction[] };

type AlertAnswer = { ok?: boolean; rows?: AlertRow[]; nextActions?: NextAction[] };

const PROJECTION_TEXTS = ["projected", "monthTarget", "attainment", "attainmentToDate", "remaining"] as const;

/** A month-end projection a card can lead with: one saved before the card read the whole month's share (an older recording or pinned answer) is left out rather than drawn half empty. */
function projectionOf(value: unknown): MonthEndProjection | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.recentDays !== "number" || !PROJECTION_TEXTS.every((key) => typeof candidate[key] === "string")) return null;
  const shortBy = typeof candidate.shortBy === "string" ? candidate.shortBy : null;
  return { ...(candidate as MonthEndProjection), shortBy };
}

export function metricAnswerOf(source: unknown): MetricAnswer | null {
  if (typeof source !== "object" || source === null) return null;
  const candidate = source as Partial<MetricAnswer>;
  if (candidate.ok !== true || !candidate.query || !Array.isArray(candidate.rows) || !candidate.headline) return null;
  const answer = candidate as MetricAnswer;
  if (answer.headline.projection === undefined || answer.headline.projection === null) return answer;
  return { ...answer, headline: { ...answer.headline, projection: projectionOf(answer.headline.projection) } };
}

/** The refusal a tool returned (`ok: false` with its reason) as the person reads it, or null when it answered. */
export function refusalOf(source: unknown): RefusalNotice | null {
  if (typeof source !== "object" || source === null) return null;
  const { ok, error, code } = source as { ok?: unknown; error?: unknown; code?: unknown };
  return ok === false && typeof error === "string" ? refusalNoticeOf(code, error) : null;
}

/** A refusal drawn as a card: why, and the way to more when the tool offered one (a request for a temporary grant). */
export function deniedParts(title: string, denied: RefusalNotice, actions: readonly NextAction[] = []): CardParts {
  const [primary = null, ...more] = actions;
  return { title, style: "chart", verdict: null, hero: null, tiles: [], body: { kind: "none" }, primary, more, footer: null, denied };
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

function dimsOf(value: unknown): string[] {
  const dims = typeof value === "object" && value !== null ? (value as { dims?: unknown }).dims : null;
  return Array.isArray(dims) ? dims.filter((dim): dim is string => typeof dim === "string" && dim in TH.dash.dimUnit) : [];
}

/** A query_metric card's title says what the card is about: the metric's name and, for a breakdown or a series of more than one row, what it is broken down by ("มูลค่าขายเข้า · รายภาค"), leaving out a time split that holds one bucket; read from the result's query or else the call's arguments. */
export function metricTitle(result: unknown, args: unknown): string {
  const answer = metricAnswerOf(result);
  const metric = metricOf(answer?.query) ?? metricOf(args);
  if (!metric) return TH.cards.unreadable;
  const dims = dimsOf(answer?.query ?? args).filter((dim) => !answer || !isTimeDim(dim as Dim) || new Set(answer.rows.map((row) => row[dim])).size > 1);
  const broken = dims.length > 0 && (!answer || answer.rows.length > 1);
  return broken ? TH.dash.ownScope(metricLabel(metric), TH.dash.byDims(dims.map((dim) => TH.dash.dimUnit[dim]))) : metricLabel(metric);
}

/** One returned tool call of a turn: its id and what came back. */
export type TurnResult = { id: string; result: unknown };

/** R10: the turn's query_metric answers that draw one card together, keyed by the call that draws it, with the calls drawn inside it; every other answer keeps its own card. */
export function metricPairsOf(results: readonly TurnResult[]): ReadonlyMap<string, readonly string[]> {
  const answers = results.flatMap((entry) => {
    const answer = metricAnswerOf(entry.result);
    return answer ? [{ id: entry.id, source: { query: answer.query, result: answer } }] : [];
  });
  const claimed = new Set<string>();
  const pairs = new Map<string, string[]>();
  answers.forEach((lead, index) => {
    if (claimed.has(lead.id)) return;
    const later = answers.slice(index + 1).filter((entry) => !claimed.has(entry.id));
    const partners = pairedIndexes(lead.source, later.map((entry) => entry.source)).map((at) => later[at].id);
    if (partners.length === 0) return;
    partners.forEach((id) => claimed.add(id));
    claimed.add(lead.id);
    pairs.set(lead.id, partners);
  });
  return pairs;
}

export function forecastTitle(result: unknown, args: unknown): string {
  const metric = metricOf(result) ?? metricOf(args);
  return metric ? TH.cards.forecastTitle(metricLabel(metric)) : TH.cards.unreadable;
}
