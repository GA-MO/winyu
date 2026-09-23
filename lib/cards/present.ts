import type { Alert, AlertRow, Dim, Forecast, MetricId, MetricQuery, MetricResult, MetricRow, NextAction, WidgetKind } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { addDays, monthKeyOfIso, weekKeyOfIso } from "@/lib/data/dates";
import { formatDateTh, formatPercent, periodLabelTh } from "@/lib/i18n/format";
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
export type CardView = WidgetKind | "auto";

export type CardHero = { label: string; value: string; delta: string | null; trend: Direction; tone: Tone; detail: string | null };
export type RankRow = { label: string; value: string; share: number | null; delta: string | null; trend: Direction; tone: Tone; note: string | null };
export type CardColumn = { key: string; label: string; align: "start" | "end" | null; tone: "default" | "muted" | "delta" | null };
export type ChartSeries = { name: string; values: (number | null)[]; style: "solid" | "dashed" | null };
export type CardAlert = { title: string; meta: string | null; body: string | null; tone: AlertTone };

export type CardBody =
  | { kind: "none" }
  | { kind: "rank"; rows: RankRow[]; showRank: boolean }
  | { kind: "progress"; label: string; value: number; detail: string }
  | { kind: "line"; labels: string[]; series: ChartSeries[]; format: MetricFormat }
  | { kind: "table"; columns: CardColumn[]; rows: Record<string, string>[] }
  | { kind: "alerts"; items: CardAlert[] };

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
};

const MAX_TABLE_ROWS = 8;
const PROGRESS_METRICS: ReadonlySet<MetricId> = new Set(["target_attainment"]);
const WORST_WHEN_LOW: ReadonlySet<MetricId> = new Set(["target_attainment", "days_of_cover"]);
const WORST_WHEN_HIGH: ReadonlySet<MetricId> = new Set(["ar_overdue", "forecast_mape"]);
const MAX_RANK_ROWS = 8;
const MAX_ALERTS = 4;
const RANK_MIN_ROWS = 2;
const TIME_DIMS: readonly Dim[] = ["date", "week", "month"];
const SUNDAY = 0;
const DC_PREFIX = "ศูนย์กระจายสินค้า";
const DC_SHORT = "ดีซี";
const PERCENT = 100;
const NO_EXTRAS: CardExtras = {};
const NO_ACTIONS: NextAction[] = [];
const SEVERITY_TONES: Record<Alert["severity"], AlertTone> = { P1: "danger", P2: "warning", P3: "info" };

function numericOf(row: MetricRow, key: string): number | null {
  const value = row[key];
  return typeof value === "number" ? value : null;
}

function deltaPercentOf(row: MetricRow): number | null {
  const stored = numericOf(row, "delta_pct");
  if (stored !== null) return stored;
  const value = numericOf(row, "value");
  const previous = numericOf(row, "compare_value");
  if (value === null || previous === null || previous === 0) return null;
  return ((value - previous) / Math.abs(previous)) * PERCENT;
}

function isTimeDim(dim: Dim): boolean {
  return TIME_DIMS.includes(dim);
}

function timeDimOf(query: MetricQuery): Dim | null {
  return query.dims.find(isTimeDim) ?? null;
}

function rankDimOf(query: MetricQuery): Dim | null {
  return query.dims.find((dim) => !isTimeDim(dim)) ?? null;
}

function labelOf(query: MetricQuery, row: MetricRow): string {
  const parts = query.dims
    .map((dim) => ({ dim, value: row[dim] }))
    .filter((part) => part.value !== null && part.value !== undefined && part.value !== "")
    .map((part) => (isTimeDim(part.dim) ? periodLabelTh(String(part.value)) : part.dim === "dc" ? String(part.value).replace(DC_PREFIX, DC_SHORT) : String(part.value)));
  return parts.length > 0 ? parts.join(" · ") : metricLabel(query.metric);
}

function valueTextOf(query: MetricQuery, row: MetricRow): string {
  const label = row.value_label;
  if (typeof label === "string") return label;
  return formatMetricValue(query.metric, row.value as number | string | null);
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

/** A trend whose last bucket is the running week or month drops that bucket and says so, instead of falling off a cliff. */
function withoutPartialBucket(query: MetricQuery, view: CardView, rows: MetricRow[]): { rows: MetricRow[]; note: string | null } {
  if (view !== "line" || rows.length < 2) return { rows, note: null };
  const dim = timeDimOf(query);
  const key = partialBucketKey(query);
  if (!dim || !key) return { rows, note: null };
  const last = rows[rows.length - 1];
  if (String(last[dim]) !== key) return { rows, note: null };
  return { rows: rows.slice(0, -1), note: query.grain === "month" ? TH.dash.partialMonth : TH.dash.partialWeek };
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

/** Which body a result deserves, from the shape of the data rather than from anyone's judgement. */
function viewFor(query: MetricQuery, rows: MetricRow[], requested: CardView, masked: boolean, extras: CardExtras): CardView {
  if (extras.alerts && extras.alerts.length > 0) return "alert_list";
  if (masked) return "kv";
  if (requested !== "auto") return requested;
  if (timeDimOf(query)) return "line";
  if (rows.length >= RANK_MIN_ROWS && rankDimOf(query)) return "bar";
  if (rows.length <= 1 && metricFormat(query.metric) === "percent") return "metric";
  if (rows.length <= 1) return "metric";
  return "table";
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

function rankRowsOf(query: MetricQuery, rows: MetricRow[]): RankRow[] {
  const values = rows.map((row) => numericOf(row, "value") ?? 0);
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

function lineBody(query: MetricQuery, rows: MetricRow[], extras: CardExtras): CardBody {
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

function alertMetaOf(alert: AlertRow): string | null {
  const gap = alert.gapLabel;
  return gap ? TH.dash.observedVsExpected(alert.observedLabel, alert.expectedLabel, gap) : null;
}

function alertsBody(alerts: AlertRow[]): CardBody {
  const said = new Set<string>();
  return {
    kind: "alerts",
    items: alerts.slice(0, MAX_ALERTS).map((alert) => {
      const repeated = said.has(alert.hypothesis);
      said.add(alert.hypothesis);
      return {
        title: `${alert.severityLabel} · ${alert.scopeLabel}`,
        meta: alertMetaOf(alert),
        body: repeated ? null : alert.hypothesis,
        tone: SEVERITY_TONES[alert.severity],
      };
    }),
  };
}

function bodyFor(query: MetricQuery, view: CardView, rows: MetricRow[], extras: CardExtras): CardBody {
  if (view === "alert_list") return alertsBody(extras.alerts ?? []);
  if (view === "line") return lineBody(query, rows, extras);
  if (view === "table") return tableBody(query, rows, query.compare !== "none");
  if (view === "bar" && rows.length >= RANK_MIN_ROWS) return { kind: "rank", rows: rankRowsOf(query, rows), showRank: rows.length > RANK_MIN_ROWS };
  if (view === "metric" && PROGRESS_METRICS.has(query.metric)) return progressBody(query, rows);
  if (view === "metric") return { kind: "none" };
  if (rows.length === 0) return { kind: "none" };
  return tableBody(query, rows, false);
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
  const view = viewFor(query, result.rows, input.view ?? "auto", masked, extras);
  const trimmed = withoutPartialBucket(query, view, result.rows);
  const rows = sorted(query, trimmed.rows, input.sortBy);
  return {
    title,
    meta: scopeOf(query, result.headline.rowCount, result.headline.periodLabel),
    description: input.description ?? null,
    footnote: footnoteOf(result, trimmed.note),
    hero: masked || view === "alert_list" ? null : heroOf(query, result),
    body: bodyFor(query, view, rows, extras),
    actions: input.actions ?? NO_ACTIONS,
    denied: null,
  };
}
