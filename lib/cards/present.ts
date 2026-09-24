import { WIDGET_KINDS, type Alert, type AlertRow, type Dim, type Forecast, type MetricId, type MetricQuery, type MetricResult, type MetricRow, type NextAction, type WidgetKind } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { addDays, monthKeyOfIso, weekKeyOfIso } from "@/lib/data/dates";
import { formatDateTh, formatPercent, periodLabelTh } from "@/lib/i18n/format";
import { deltaPercentOf, groupDimsOf, labelOf, numericOf, timeDimOf, valueTextOf } from "./rows";
import {
  bucketCountOf,
  funnelBody,
  gapBody,
  gapHero,
  groupCountOf,
  heatmapBody,
  isIndexedOverlay,
  isParityPair,
  joinedRows,
  overlaidLines,
  sameUnit,
  scatterBody,
  seriesByGroup,
  shareBody,
  type Source,
} from "./chart-bodies";
import {
  directionOf,
  formatDelta,
  formatMetricValue,
  metricFormat,
  metricLabel,
  toneOf,
  type Direction,
  type MetricFormat,
  type Tone,
} from "@/lib/dashboard/metric-display";

export type AlertTone = "info" | "success" | "warning" | "danger";
export type SortBy = "value_desc" | "value_asc" | "delta_asc" | "delta_desc";
export type CardView = WidgetKind | "auto" | "scatter" | "funnel";

export type CardHero = { label: string; value: string; delta: string | null; trend: Direction; tone: Tone; detail: string | null };
export type RankRow = { label: string; value: string; share: number | null; delta: string | null; trend: Direction; tone: Tone; note: string | null };
export type CardColumn = { key: string; label: string; align: "start" | "end" | null; tone: "default" | "muted" | "delta" | null };
export type ChartSeries = { name: string; values: (number | null)[]; style: "solid" | "dashed" | null };
export type SignalItem = {
  id: string;
  name: string;
  place: string;
  gap: string | null;
  gapTone: Tone;
  gapCaption: string | null;
  numbers: string;
  severity: AlertTone;
  severityLabel: string;
  why: string | null;
};

export type ColorScale = "value" | "delta";
export type HeatCell = { text: string; detail: string | null; intensity: number; tone: Tone };
export type ShareSlice = { label: string; valueText: string; share: number; shareText: string; isOther: boolean };
export type ScatterPoint = { label: string; x: number; y: number; xText: string; yText: string; named: boolean };
export type ScatterAxis = { label: string; format: MetricFormat; median: number; medianText: string };
export type GapRow = { label: string; gap: number; gapText: string; detail: string; tone: Tone };
export type FunnelStage = { label: string; value: number; valueText: string; width: number; dropText: string | null; dropTone: Tone };

export type CardBody =
  | { kind: "none" }
  | { kind: "rank"; rows: RankRow[]; showRank: boolean }
  | { kind: "progress"; label: string; value: number; detail: string }
  | { kind: "line"; labels: string[]; series: ChartSeries[]; format: MetricFormat }
  | { kind: "stacked"; shape: "bar" | "area"; labels: string[]; series: ChartSeries[]; format: MetricFormat }
  | { kind: "share"; slices: ShareSlice[]; centerValue: string; centerLabel: string }
  | { kind: "heatmap"; rowLabels: string[]; columnLabels: string[]; cells: (HeatCell | null)[][]; scale: ColorScale; legend: string }
  | { kind: "scatter"; points: ScatterPoint[]; x: ScatterAxis; y: ScatterAxis; note: string | null }
  | { kind: "gap"; rows: GapRow[]; caption: string; shownOf: string | null }
  | { kind: "funnel"; stages: FunnelStage[] }
  | { kind: "table"; columns: CardColumn[]; rows: Record<string, string>[] }
  | { kind: "alerts"; items: SignalItem[] };

export type CardParts = {
  title: string;
  meta: string | null;
  description: string | null;
  footnote: string | null;
  hero: CardHero | null;
  body: CardBody;
  actions: NextAction[];
  denied: string | null;
};

export type CardExtras = { alerts?: AlertRow[]; forecast?: Forecast | null; overlay?: { name: string; result: MetricResult } | null };

export type PresentInput = {
  title: string;
  query: MetricQuery;
  result: MetricResult;
  view?: CardView;
  sortBy?: SortBy | null;
  description?: string | null;
  extras?: CardExtras;
  actions?: NextAction[];
  others?: PresentSource[];
};

export type PresentSource = { query: MetricQuery; result: MetricResult };

const MAX_TABLE_ROWS = 8;
const PROGRESS_METRICS: ReadonlySet<MetricId> = new Set(["target_attainment"]);
const WORST_WHEN_LOW: ReadonlySet<MetricId> = new Set(["target_attainment", "days_of_cover"]);
const WORST_WHEN_HIGH: ReadonlySet<MetricId> = new Set(["ar_overdue", "forecast_mape"]);
const MAX_RANK_ROWS = 8;
const MAX_ALERTS = 4;
const PARENTHETICAL = /\s*\(.*\)$/;
const SCOPE_SEPARATOR = " · ";
const MINUS_SIGN = "−";
const PLUS_SIGN = "+";
const RANK_MIN_ROWS = 2;
const SUNDAY = 0;
const PERCENT = 100;
const NO_EXTRAS: CardExtras = {};
const NO_ACTIONS: NextAction[] = [];
const MAX_LINES = 5;
const MAX_BAR_BUCKETS = 12;
const MAX_SHARE_ROWS = 6;
const MIN_SCATTER_POINTS = 4;
const MIN_GRID_FILL = 0.6;
const COMPOSITION_DIMS: ReadonlySet<Dim> = new Set(["channel", "business_unit", "maker", "pack"]);
const SHARE_METRICS: ReadonlySet<MetricId> = new Set(["market_share", "share_of_voice"]);
const SEVERITY_TONES: Record<Alert["severity"], AlertTone> = { P1: "danger", P2: "warning", P3: "info" };

function rankDimOf(query: MetricQuery): Dim | null {
  return groupDimsOf(query)[0] ?? null;
}

function endsOnFullBucket(query: MetricQuery): boolean {
  if (query.grain === "month") return monthKeyOfIso(addDays(query.range.to, 1)) !== monthKeyOfIso(query.range.to);
  if (query.grain === "week") return new Date(`${query.range.to}T00:00:00Z`).getUTCDay() === SUNDAY;
  return true;
}

function partialBucketKey(query: MetricQuery): string | null {
  if (endsOnFullBucket(query)) return null;
  if (query.grain === "month") return monthKeyOfIso(query.range.to);
  if (query.grain === "week") return weekKeyOfIso(query.range.to);
  return null;
}

const TIME_BODIES: ReadonlySet<CardView> = new Set(["line", "stacked", "area", "heatmap"]);

/** A trend whose last bucket is the running week or month drops that bucket and says so, instead of falling off a cliff. */
function withoutPartialBucket(query: MetricQuery, view: CardView, rows: MetricRow[]): { rows: MetricRow[]; note: string | null } {
  if (!TIME_BODIES.has(view) || rows.length < 2) return { rows, note: null };
  const dim = timeDimOf(query);
  const key = partialBucketKey(query);
  if (!dim || !key) return { rows, note: null };
  const kept = rows.filter((row) => String(row[dim]) !== key);
  if (kept.length === rows.length || kept.length === 0) return { rows, note: null };
  return { rows: kept, note: query.grain === "month" ? TH.dash.partialMonth : TH.dash.partialWeek };
}

const SORTERS: Record<SortBy, (query: MetricQuery) => (left: MetricRow, right: MetricRow) => number> = {
  value_desc: () => (left, right) => (numericOf(right, "value") ?? 0) - (numericOf(left, "value") ?? 0),
  value_asc: () => (left, right) => (numericOf(left, "value") ?? 0) - (numericOf(right, "value") ?? 0),
  delta_asc: () => (left, right) => (deltaPercentOf(left) ?? 0) - (deltaPercentOf(right) ?? 0),
  delta_desc: () => (left, right) => (deltaPercentOf(right) ?? 0) - (deltaPercentOf(left) ?? 0),
};

function sorted(query: MetricQuery, rows: MetricRow[], sortBy: SortBy | null | undefined): MetricRow[] {
  if (!sortBy || timeDimOf(query)) return rows;
  return [...rows].sort(SORTERS[sortBy](query));
}

type Shape = { query: MetricQuery; rows: MetricRow[]; additive: boolean; sortBy: SortBy | null };

function asksAboutChange(sortBy: SortBy | null): boolean {
  return sortBy === "delta_asc" || sortBy === "delta_desc";
}

function isPartOfWhole(shape: Shape): boolean {
  const dim = rankDimOf(shape.query);
  if (!dim || !COMPOSITION_DIMS.has(dim) || groupDimsOf(shape.query).length !== 1 || timeDimOf(shape.query)) return false;
  if (shape.rows.length < RANK_MIN_ROWS || shape.rows.length > MAX_SHARE_ROWS) return false;
  return shape.additive || SHARE_METRICS.has(shape.query.metric);
}

/** Whether two breakdowns fill enough of their grid to read as a heatmap; a top-N of DC × SKU leaves it mostly empty and reads better as ranked bars. */
function isDenseGrid(shape: Shape): boolean {
  const [first, second] = groupDimsOf(shape.query);
  if (!first || !second) return false;
  const distinct = (dim: Dim) => new Set(shape.rows.map((row) => row[dim])).size;
  const columns = distinct(second);
  const cells = distinct(first) * columns;
  return columns >= RANK_MIN_ROWS && distinct(first) >= RANK_MIN_ROWS && shape.rows.length / cells >= MIN_GRID_FILL;
}

/** Whether the data can be drawn the way someone asked; a view the data cannot fill falls back to the automatic one. */
function canDraw(view: CardView, shape: Shape): boolean {
  const time = timeDimOf(shape.query);
  const groups = groupDimsOf(shape.query).length;
  if (view === "metric") return true;
  if (view === "table" || view === "kv") return time !== null || shape.rows.length < RANK_MIN_ROWS;
  if (view === "bar") return shape.rows.length >= RANK_MIN_ROWS && !time;
  if (view === "line") return time !== null;
  if (view === "stacked" || view === "area") return time !== null && groups >= 1 && shape.additive;
  if (view === "heatmap") return (time !== null && groups >= 1) || isDenseGrid(shape);
  if (view === "share") return !time && groups === 1 && shape.rows.length >= RANK_MIN_ROWS && (shape.additive || SHARE_METRICS.has(shape.query.metric));
  return false;
}

function timeView(shape: Shape): CardView {
  if (groupDimsOf(shape.query).length === 0) return "line";
  if (shape.additive) return bucketCountOf(shape.query, shape.rows) > MAX_BAR_BUCKETS ? "area" : "stacked";
  return groupCountOf(shape.query, shape.rows) <= MAX_LINES ? "line" : "heatmap";
}

function automaticView(shape: Shape): CardView {
  const groups = groupDimsOf(shape.query);
  if (timeDimOf(shape.query)) return timeView(shape);
  if (groups.length >= 2) return isDenseGrid(shape) ? "heatmap" : "bar";
  if (shape.rows.length <= 1) return "metric";
  if (groups.length === 0) return "table";
  if (isPartOfWhole(shape) && !asksAboutChange(shape.sortBy)) return "share";
  return "bar";
}

/** The widget kind a result is drawn as when nobody asks for one, so a pinned card looks like the card it was pinned from. */
export function widgetKindFor(query: MetricQuery, result: MetricResult): WidgetKind {
  if (!result.ok) return "metric";
  const view = automaticView({ query, rows: result.rows, additive: result.headline.aggregate === "sum", sortBy: null });
  return WIDGET_KINDS.includes(view as WidgetKind) ? (view as WidgetKind) : "table";
}

/** Which body a result deserves, from the shape of the data rather than from anyone's judgement. */
function viewFor(shape: Shape, requested: CardView, masked: boolean, extras: CardExtras): CardView {
  if (extras.alerts && extras.alerts.length > 0) return "alert_list";
  if (masked) return "kv";
  if (requested !== "auto" && canDraw(requested, shape)) return requested;
  return automaticView(shape);
}

function groupCountFor(query: MetricQuery, rows: MetricRow[], rowCount: number): number {
  const dim = rankDimOf(query);
  if (!dim || (!timeDimOf(query) && groupDimsOf(query).length === 1)) return rowCount;
  return new Set(rows.map((row) => row[dim])).size;
}

function scopeOf(query: MetricQuery, rowCount: number, periodLabel: string): string {
  const dim = rankDimOf(query);
  const unit = dim ? TH.dash.dimUnit[dim] : null;
  return TH.dash.scope(periodLabel, unit && rowCount > 1 ? `${rowCount} ${unit}` : null);
}

function footnoteOf(result: Extract<MetricResult, { ok: true }>, extraNote: string | null): string {
  const trust = TH.dash.trust[result.provenance.trust];
  const masked = result.provenance.masked.length > 0 ? TH.dash.maskedNote(result.provenance.masked.length) : null;
  return [TH.dash.provenance(result.provenance.sourceSystem, trust, formatDateTh(result.provenance.asOf)), masked, extraNote]
    .filter((line): line is string => line !== null)
    .join(" · ");
}

function heroOf(query: MetricQuery, result: Extract<MetricResult, { ok: true }>): CardHero {
  const delta = result.headline.deltaPercent;
  return {
    label: metricLabel(query.metric),
    value: result.headline.value,
    delta: formatDelta(delta),
    trend: directionOf(delta),
    tone: toneOf(query.metric, delta),
    detail: result.headline.compareLabel,
  };
}

/** Bars measure what the list is ordered by: the size of the change when the question is what fell or grew, the value otherwise. */
function rankRowsOf(query: MetricQuery, rows: MetricRow[], sortBy: SortBy | null): RankRow[] {
  const values = rows.map((row) => (asksAboutChange(sortBy) ? deltaPercentOf(row) : numericOf(row, "value")) ?? 0);
  const peak = Math.max(...values.map(Math.abs), 0);
  return rows.slice(0, MAX_RANK_ROWS).map((row, index) => {
    const delta = deltaPercentOf(row);
    return {
      label: labelOf(query, row),
      value: valueTextOf(query, row),
      share: peak === 0 ? null : Math.abs(values[index]) / peak,
      delta: formatDelta(delta),
      trend: directionOf(delta),
      tone: toneOf(query.metric, delta),
      note: null,
    };
  });
}

function chartPoints(query: MetricQuery, rows: MetricRow[]): { label: string; value: number }[] {
  return rows
    .map((row) => ({ label: labelOf(query, row), value: numericOf(row, "value") }))
    .filter((point): point is { label: string; value: number } => point.value !== null);
}

function overlaySeries(query: MetricQuery, labels: string[], extras: CardExtras): ChartSeries | null {
  const overlay = extras.overlay;
  if (!overlay || !overlay.result.ok) return null;
  const byLabel = new Map(chartPoints(query, overlay.result.rows).map((point) => [point.label, point.value]));
  return { name: overlay.name, values: labels.map((label) => byLabel.get(label) ?? null), style: null };
}

function compareSeries(query: MetricQuery, rows: MetricRow[]): ChartSeries | null {
  if (query.compare === "none") return null;
  const values = rows.map((row) => numericOf(row, "compare_value"));
  if (values.every((value) => value === null)) return null;
  return { name: TH.dash.compare[query.compare], values, style: "dashed" };
}

function lineBody(shape: Shape, extras: CardExtras): CardBody {
  const { query, rows } = shape;
  if (groupDimsOf(query).length > 0) {
    const grouped = seriesByGroup(query, rows, false);
    return { kind: "line", labels: grouped.labels, series: grouped.series, format: metricFormat(query.metric) };
  }
  const points = chartPoints(query, rows);
  const labels = points.map((point) => point.label);
  const actual: ChartSeries = { name: metricLabel(query.metric), values: points.map((point) => point.value), style: null };
  const format = metricFormat(query.metric);
  const overlay = overlaySeries(query, labels, extras);
  if (overlay) return { kind: "line", labels, series: [actual, overlay], format };
  const previous = compareSeries(query, rows);
  if (previous) return { kind: "line", labels, series: [actual, previous], format };
  const forecast = extras.forecast;
  if (!forecast || forecast.points.length === 0) return { kind: "line", labels, series: [actual], format };
  const futureLabels = forecast.points.map((point) => periodLabelTh(weekKeyOfIso(point.date)));
  const gap = labels.slice(0, -1).map(() => null);
  return {
    kind: "line",
    labels: [...labels, ...futureLabels],
    series: [
      { ...actual, values: [...actual.values, ...futureLabels.map(() => null)] },
      { name: TH.dash.forecast, values: [...gap, ...forecast.points.map((point) => point.value)], style: "dashed" },
    ],
    format,
  };
}

function tableBody(query: MetricQuery, rows: MetricRow[], withCompare: boolean): CardBody {
  const dim = rankDimOf(query) ?? timeDimOf(query);
  const columns: CardColumn[] = [
    { key: "label", label: dim ? TH.dash.dimUnit[dim] : TH.dash.item, align: null, tone: null },
    { key: "value", label: metricLabel(query.metric), align: "end", tone: null },
    ...(withCompare ? [{ key: "delta", label: TH.dash.compare[query.compare], align: "end" as const, tone: "delta" as const }] : []),
  ];
  return {
    kind: "table",
    columns,
    rows: rows.slice(0, MAX_TABLE_ROWS).map((row) => ({
      label: labelOf(query, row),
      value: valueTextOf(query, row),
      ...(withCompare ? { delta: formatDelta(deltaPercentOf(row)) ?? "—" } : {}),
    })),
  };
}

function progressBody(query: MetricQuery, rows: MetricRow[]): CardBody {
  const value = numericOf(rows[0] ?? {}, "value");
  if (value === null) return { kind: "none" };
  const remaining = Math.round((PERCENT - value) * 10) / 10;
  return {
    kind: "progress",
    label: metricLabel(query.metric),
    value: Math.max(0, Math.min(PERCENT, value)),
    detail: remaining > 0 ? TH.dash.toTarget(formatPercent(remaining)) : TH.dash.targetMet,
  };
}

function signedGapOf(alert: AlertRow): string | null {
  if (!alert.gapLabel) return null;
  return `${alert.direction === "down" ? MINUS_SIGN : PLUS_SIGN}${alert.gapLabel}`;
}

function signalOf(alert: AlertRow, why: string | null): SignalItem {
  const [name = alert.scopeLabel, ...rest] = alert.scopeLabel.split(SCOPE_SEPARATOR);
  const metric = alert.metricLabel.replace(PARENTHETICAL, "");
  return {
    id: alert.id,
    name,
    place: [...rest, metric].join(SCOPE_SEPARATOR),
    gap: signedGapOf(alert),
    gapTone: toneOf(alert.metric, alert.direction === "down" ? -PERCENT : PERCENT),
    gapCaption: alert.gapLabel ? (alert.direction === "down" ? TH.dash.belowExpected : TH.dash.aboveExpected) : null,
    numbers: alert.yearOverYear ? alert.observedLabel : TH.dash.actualVsExpected(alert.observedLabel, alert.expectedLabel),
    severity: SEVERITY_TONES[alert.severity],
    severityLabel: alert.severityLabel,
    why,
  };
}

function alertsBody(alerts: AlertRow[]): CardBody {
  const said = new Set<string>();
  return {
    kind: "alerts",
    items: alerts.slice(0, MAX_ALERTS).map((alert) => {
      const repeated = said.has(alert.hypothesis);
      said.add(alert.hypothesis);
      return signalOf(alert, repeated ? null : alert.hypothesis);
    }),
  };
}

function bodyFor(shape: Shape, view: CardView, extras: CardExtras): CardBody {
  const { query, rows } = shape;
  if (view === "alert_list") return alertsBody(extras.alerts ?? []);
  if (view === "line") return lineBody(shape, extras);
  if (view === "stacked" || view === "area") {
    const grouped = seriesByGroup(query, rows, true);
    return { kind: "stacked", shape: view === "area" ? "area" : "bar", labels: grouped.labels, series: grouped.series, format: metricFormat(query.metric) };
  }
  if (view === "heatmap") return heatmapBody(query, rows, shape.sortBy);
  if (view === "share") return shareBody(query, rows);
  if (view === "table") return tableBody(query, rows, query.compare !== "none");
  if (view === "bar" && rows.length >= RANK_MIN_ROWS) return { kind: "rank", rows: rankRowsOf(query, rows, shape.sortBy), showRank: rows.length > RANK_MIN_ROWS };
  if (view === "metric" && PROGRESS_METRICS.has(query.metric)) return progressBody(query, rows);
  if (view === "metric") return { kind: "none" };
  if (rows.length === 0) return { kind: "none" };
  return tableBody(query, rows, false);
}

function hiddenGroupsNote(shape: Shape, view: CardView): string | null {
  if (view !== "line" || shape.additive || groupDimsOf(shape.query).length === 0) return null;
  const count = groupCountOf(shape.query, shape.rows);
  return count > MAX_LINES ? TH.dash.shownOf(MAX_LINES, count) : null;
}

type Pairing = { view: "scatter" | "gap" | "funnel" | "overlay"; sources: Source[] };

/** What a card bound to several metric results should draw, or null when they do not fit together and only the first is shown. */
function pairingOf(first: Source, others: Source[]): Pairing | null {
  if (others.length === 0) return null;
  const all = [first, ...others];
  const noDims = all.every((source) => source.query.dims.length === 0);
  if (noDims && sameUnit(all)) return { view: "funnel", sources: all };
  const timeOnly = all.every((source) => timeDimOf(source.query) !== null && groupDimsOf(source.query).length === 0);
  if (timeOnly) return { view: "overlay", sources: all };
  const [second] = others;
  const sameGroups = groupDimsOf(first.query).join() === groupDimsOf(second.query).join() && groupDimsOf(first.query).length > 0;
  const untimed = !timeDimOf(first.query) && !timeDimOf(second.query);
  if (!sameGroups || !untimed) return null;
  if (isParityPair(first, second) && joinedRows(first, second).length >= RANK_MIN_ROWS) return { view: "gap", sources: [first, second] };
  if (joinedRows(first, second).length >= MIN_SCATTER_POINTS) return { view: "scatter", sources: [first, second] };
  return null;
}

function pairedBody(pairing: Pairing): CardBody {
  const [first, ...others] = pairing.sources;
  if (pairing.view === "funnel") return funnelBody(pairing.sources);
  if (pairing.view === "scatter") return scatterBody(first, others[0]);
  if (pairing.view === "gap") return gapBody(first, others[0]);
  return overlaidLines(first, others);
}

function pairedMeta(pairing: Pairing): string {
  const [first, ...others] = pairing.sources;
  const period = first.result.headline.periodLabel;
  if (pairing.view !== "scatter" && pairing.view !== "gap") return TH.dash.scope(period, null);
  const dim = rankDimOf(first.query);
  const count = joinedRows(first, others[0]).length;
  return TH.dash.scope(period, dim ? `${count} ${TH.dash.dimUnit[dim]}` : null);
}

function pairedHero(pairing: Pairing, indexed: boolean): CardHero | null {
  const [first, ...others] = pairing.sources;
  if (pairing.view === "gap") {
    const dim = rankDimOf(first.query);
    return gapHero(first, others[0], dim ? TH.dash.dimUnit[dim] : null);
  }
  return pairing.view === "overlay" && !indexed ? heroOf(first.query, first.result) : null;
}

function pairedCard(input: PresentInput, pairing: Pairing): CardParts {
  const [first, ...others] = pairing.sources;
  const indexed = pairing.view === "overlay" && isIndexedOverlay(first, others);
  return {
    title: input.title,
    meta: pairedMeta(pairing),
    description: input.description ?? null,
    footnote: footnoteOf(first.result, indexed ? TH.dash.indexedNote : null),
    hero: pairedHero(pairing, indexed),
    body: pairedBody(pairing),
    actions: input.actions ?? NO_ACTIONS,
    denied: null,
  };
}

function okSources(others: PresentSource[] | undefined): Source[] {
  return (others ?? []).flatMap((other) => (other.result.ok ? [{ query: other.query, result: other.result }] : []));
}

export type PresentAlertsInput = {
  title: string;
  alerts: AlertRow[];
  description?: string | null;
  actions?: NextAction[];
};

/** A list of anomalies as a card: severity, Thai scope, observed against expected, the hypothesis. */
export function presentAlerts(input: PresentAlertsInput): CardParts {
  return {
    title: input.title,
    meta: TH.dash.alertCount(Math.min(input.alerts.length, MAX_ALERTS), input.alerts.length),
    description: input.description ?? null,
    footnote: null,
    hero: null,
    body: alertsBody(input.alerts),
    actions: input.actions ?? NO_ACTIONS,
    denied: null,
  };
}

export type WeakestRow = { label: string; value: string; lowIsWorst: boolean };

/** The row that most needs attention in a breakdown whose level decides — lowest attainment or cover, highest overdue or forecast error — or null. */
export function weakestRow(query: MetricQuery, result: MetricResult): WeakestRow | null {
  if (!result.ok || !rankDimOf(query) || timeDimOf(query) || result.rows.length < 2) return null;
  const lowIsWorst = WORST_WHEN_LOW.has(query.metric);
  if (!lowIsWorst && !WORST_WHEN_HIGH.has(query.metric)) return null;
  const scored = result.rows.map((row) => ({ row, value: numericOf(row, "value") })).filter((entry): entry is { row: MetricRow; value: number } => entry.value !== null);
  if (scored.length < 2) return null;
  const worst = scored.reduce((best, entry) => ((lowIsWorst ? entry.value < best.value : entry.value > best.value) ? entry : best));
  return { label: labelOf(query, worst.row), value: valueTextOf(query, worst.row), lowIsWorst };
}

export type HarmfulRow = { label: string; delta: string; deltaPercent: number };

/** The row of a breakdown that moved furthest in the bad direction, when it moved at least `minPercent`; time series have no such row. */
export function sharpestHarm(query: MetricQuery, result: MetricResult, minPercent: number): HarmfulRow | null {
  if (!result.ok || !rankDimOf(query) || timeDimOf(query)) return null;
  let worst: HarmfulRow | null = null;
  for (const row of result.rows) {
    const delta = deltaPercentOf(row);
    if (delta === null || Math.abs(delta) < minPercent || toneOf(query.metric, delta) !== "bad") continue;
    if (worst && Math.abs(delta) <= Math.abs(worst.deltaPercent)) continue;
    worst = { label: labelOf(query, row), delta: formatDelta(delta) ?? "", deltaPercent: delta };
  }
  return worst;
}

/**
 * The one decision table for every data card in Cop: what the headline is, which body the data shape deserves,
 * what the scope and source lines say. The dashboard renders it as a Vexa spec, the chat renders it as React.
 */
export function presentCard(input: PresentInput): CardParts {
  const { query, result, title } = input;
  if (!result.ok) {
    return { title, meta: null, description: null, footnote: null, hero: null, body: { kind: "none" }, actions: [], denied: result.error };
  }
  const extras = input.extras ?? NO_EXTRAS;
  const masked = result.provenance.masked.length > 0;
  const pairing = masked ? null : pairingOf({ query, result }, okSources(input.others));
  if (pairing) return pairedCard(input, pairing);
  const sortBy = input.sortBy ?? query.sort ?? null;
  const whole: Shape = { query, rows: result.rows, additive: result.headline.aggregate === "sum", sortBy };
  const view = viewFor(whole, input.view ?? "auto", masked, extras);
  const trimmed = withoutPartialBucket(query, view, result.rows);
  const shape: Shape = { ...whole, rows: sorted(query, trimmed.rows, sortBy) };
  const note = [trimmed.note, hiddenGroupsNote(shape, view)].filter((line): line is string => line !== null).join(" · ");
  return {
    title,
    meta: scopeOf(query, groupCountFor(query, result.rows, result.headline.rowCount), result.headline.periodLabel),
    description: input.description ?? null,
    footnote: footnoteOf(result, note || null),
    hero: masked || view === "alert_list" ? null : heroOf(query, result),
    body: bodyFor(shape, view, extras),
    actions: input.actions ?? NO_ACTIONS,
    denied: null,
  };
}
