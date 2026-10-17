import type { Alert, CardFocus, Dim, MetricId, MetricResult, ResolvedQuery } from "@/lib/contracts";
import { alertScopeLabel } from "@/lib/cards/alert-row";
import { sharpestHarm, weakestRow } from "@/lib/cards/present";
import { isTimeDim } from "@/lib/cards/rows";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";
import type { Dictionary } from "@/lib/semantic/dictionary";
import { GEO_LEVELS, geoValueOf } from "@/lib/semantic/geo";

const HARM_MIN_PCT = 5;
const PERIOD_COMPARES: ReadonlySet<ResolvedQuery["compare"]> = new Set(["prev_period", "prev_year"]);
const LABEL_SEPARATOR = ", ";
const PART_SEPARATOR = " · ";

function rankDimOf(query: ResolvedQuery): Dim | null {
  return query.dims.find((dim) => !isTimeDim(dim)) ?? null;
}

function labelsAt(query: ResolvedQuery, dim: Dim): string[] {
  return query.labels[dim] ?? [];
}

function alertRow(dim: Dim, alert: Alert | null, dictionary: Dictionary): string | null {
  if (!alert) return null;
  const id = GEO_LEVELS.includes(dim) ? geoValueOf(dictionary, alert.dims, dim) : (alert.dims[dim] ?? null);
  return id ? dictionary.displayLabel(dim, id) : null;
}

function pinnedRow(query: ResolvedQuery, dim: Dim): string | null {
  const labels = labelsAt(query, dim);
  return labels.length === 1 ? labels[0] : null;
}

function askedRow(result: Extract<MetricResult, { ok: true }>): string | null {
  const asked = result.headline.asked ?? [];
  return asked.length === 1 ? asked[0] : null;
}

function worstRow(result: Extract<MetricResult, { ok: true }>): string | null {
  const harm = sharpestHarm(result.query, result, HARM_MIN_PCT)?.label ?? null;
  if (PERIOD_COMPARES.has(result.query.compare)) return harm;
  return weakestRow(result.query, result)?.label ?? harm;
}

function sliceOf(query: ResolvedQuery, rankDim: Dim | null): string | null {
  const narrowed = (Object.entries(query.labels) as [Dim, string[]][])
    .filter(([dim, labels]) => !isTimeDim(dim) && labels.length > 0 && !(dim === rankDim && labels.length > 1))
    .map(([, labels]) => labels.join(LABEL_SEPARATOR));
  const split = rankDim && pinnedRow(query, rankDim) === null ? TH.next.splitBy(TH.dash.dimUnit[rankDim]) : null;
  const parts = split ? [...narrowed, split] : narrowed;
  return parts.length > 0 ? parts.join(PART_SEPARATOR) : null;
}

/** The open alert a metric card is about, of those on its metric and slice: the one on the row the answer points at (the row pinned or asked for, else the weakest or sharpest-falling row), so the card's buttons follow the answer; with no such row the first of them; an alert on another row belongs to another answer. */
export function alertForAnswer(result: Extract<MetricResult, { ok: true }>, alerts: readonly Alert[], dictionary: Dictionary): Alert | null {
  const rankDim = rankDimOf(result.query);
  const answer = rankDim ? (pinnedRow(result.query, rankDim) ?? askedRow(result) ?? worstRow(result)) : null;
  if (!rankDim || !answer) return alerts[0] ?? null;
  return alerts.find((alert) => alertRow(rankDim, alert, dictionary) === answer) ?? null;
}

/** The one decision of what a metric card is about: the row it points at, the slice it covers, and what work handed on from it names. */
export function cardFocus(result: Extract<MetricResult, { ok: true }>, alert: Alert | null, dictionary: Dictionary): CardFocus {
  const { query } = result;
  const rankDim = rankDimOf(query);
  const row = rankDim ? (alertRow(rankDim, alert, dictionary) ?? pinnedRow(query, rankDim) ?? askedRow(result) ?? worstRow(result)) : null;
  const slice = sliceOf(query, rankDim);
  return { slice, row, subject: alert ? alertScopeLabel(alert, dictionary) : (row ?? slice) };
}

/** An anomaly card is about its alert alone. */
export function alertFocus(alert: Alert, dictionary: Dictionary): CardFocus {
  const scope = alertScopeLabel(alert, dictionary);
  return { slice: scope, row: scope, subject: scope };
}

/** A card's name for what it is about: "มูลค่าขายเข้า · ภาคอีสาน", or the metric alone when it covers everything. */
export function focusTitle(metric: MetricId, label: string | null): string {
  return label ? `${metricLabel(metric)}${PART_SEPARATOR}${label}` : metricLabel(metric);
}
