import type { Dim, MetricId, MetricQuery, MetricResult, MetricRow } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { formatPercent, formatWhole, periodLabelTh } from "@/lib/i18n/format";
import { directionOf, formatDelta, formatMetricValue, metricFormat, metricLabel, metricUnit, toneOf, type Tone } from "@/lib/dashboard/metric-display";
import { deltaPercentOf, groupDimsOf, labelAlong, labelOf, numericOf, timeDimOf, valueTextOf } from "./rows";
import type { CardBody, CardHero, ChartSeries, ColorScale, GapRow, HeatCell, ScatterAxis, ScatterPoint, ShareSlice } from "./present";

export type Source = { query: MetricQuery; result: Extract<MetricResult, { ok: true }> };

const MAX_SERIES = 5;
const MAX_SLICES = 6;
const MAX_CALLOUTS = 3;
const MAX_NAMED_POINTS = 4;
const MIN_INTENSITY = 0.15;
const PERCENT = 100;
const STRONG_CORRELATION = 0.5;
const PARITY_RATIO = 3;
const MAX_GAP_ROWS = 8;
const WIDE_GAP_PCT = 5;
const MIN_GAP_SCALE_PCT = 10;
const PARENTHETICAL = /\s*\(.*\)$/;
const PERCENT_METRIC_SHARE: ReadonlySet<MetricId> = new Set(["market_share", "share_of_voice"]);
const WORST_WHEN_LOW: ReadonlySet<MetricId> = new Set(["target_attainment", "days_of_cover", "market_share", "gross_margin"]);
const WORST_WHEN_HIGH: ReadonlySet<MetricId> = new Set(["ar_overdue", "forecast_mape", "attrition_rate"]);

type Group = { key: string; total: number; values: Map<string, number> };

function groupKeyOf(query: MetricQuery, row: MetricRow): string {
  return labelAlong(groupDimsOf(query), row) ?? metricLabel(query.metric);
}

function bucketsOf(query: MetricQuery, rows: MetricRow[]): string[] {
  const dim = timeDimOf(query);
  if (!dim) return [];
  return [...new Set(rows.map((row) => String(row[dim])))].sort();
}

function groupsOf(query: MetricQuery, rows: MetricRow[]): Group[] {
  const dim = timeDimOf(query);
  const groups = new Map<string, Group>();
  for (const row of rows) {
    const value = numericOf(row, "value");
    if (value === null) continue;
    const key = groupKeyOf(query, row);
    const group = groups.get(key) ?? { key, total: 0, values: new Map<string, number>() };
    group.total += value;
    if (dim) group.values.set(String(row[dim]), value);
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) => right.total - left.total);
}

/** How many distinct groups a time × group result has, the way the chart would draw them. */
export function groupCountOf(query: MetricQuery, rows: MetricRow[]): number {
  return groupsOf(query, rows).length;
}

export function bucketCountOf(query: MetricQuery, rows: MetricRow[]): number {
  return bucketsOf(query, rows).length;
}

function othersGroup(rest: Group[]): Group {
  const values = new Map<string, number>();
  for (const group of rest) for (const [bucket, value] of group.values) values.set(bucket, (values.get(bucket) ?? 0) + value);
  return { key: TH.dash.others, total: rest.reduce((sum, group) => sum + group.total, 0), values };
}

function keptGroups(groups: Group[], additive: boolean): Group[] {
  if (groups.length <= MAX_SERIES) return groups;
  if (!additive) return groups.slice(0, MAX_SERIES);
  return [...groups.slice(0, MAX_SERIES - 1), othersGroup(groups.slice(MAX_SERIES - 1))];
}

/** One series per group along the time axis; beyond five groups the rest fold into "อื่น ๆ" when they add up, or are left out when they do not. */
export function seriesByGroup(query: MetricQuery, rows: MetricRow[], additive: boolean): { labels: string[]; series: ChartSeries[]; hidden: number } {
  const buckets = bucketsOf(query, rows);
  const groups = groupsOf(query, rows);
  const kept = keptGroups(groups, additive);
  return {
    labels: buckets.map(periodLabelTh),
    series: kept.map((group) => ({ name: group.key, values: buckets.map((bucket) => group.values.get(bucket) ?? null), style: null })),
    hidden: additive ? 0 : groups.length - kept.length,
  };
}

function spread(values: number[]): { min: number; max: number } {
  return { min: Math.min(...values), max: Math.max(...values) };
}

function scaled(share: number): number {
  return Math.round((MIN_INTENSITY + (1 - MIN_INTENSITY) * Math.max(0, Math.min(1, share))) * 100) / 100;
}

function deltaScaleOf(rows: MetricRow[]): number | null {
  const deltas = rows.map(deltaPercentOf).filter((delta): delta is number => delta !== null);
  if (deltas.length === 0) return null;
  return Math.max(...deltas.map(Math.abs), 1);
}

type CellPainter = (row: MetricRow) => HeatCell | null;

function cellPainter(query: MetricQuery, rows: MetricRow[], scale: ColorScale): CellPainter {
  const values = rows.map((row) => numericOf(row, "value")).filter((value): value is number => value !== null);
  const range = values.length > 0 ? spread(values) : { min: 0, max: 0 };
  const deltaMax = deltaScaleOf(rows) ?? 1;
  return (row) => {
    const value = numericOf(row, "value");
    if (value === null) return null;
    const delta = deltaPercentOf(row);
    const deltaText = formatDelta(delta);
    if (scale === "delta") {
      return { text: deltaText ?? "—", detail: valueTextOf(query, row), intensity: delta === null ? 0 : scaled(Math.abs(delta) / deltaMax), tone: toneOf(query.metric, delta) };
    }
    const width = range.max - range.min;
    return { text: valueTextOf(query, row), detail: deltaText, intensity: scaled(width === 0 ? 1 : (value - range.min) / width), tone: "neutral" };
  };
}

function scaleFor(query: MetricQuery, rows: MetricRow[]): ColorScale {
  if (query.compare === "none" || timeDimOf(query)) return "value";
  return deltaScaleOf(rows) === null ? "value" : "delta";
}

function legendOf(query: MetricQuery, scale: ColorScale): string {
  if (scale === "delta") return TH.dash.legendDelta(TH.dash.compare[query.compare]);
  return TH.dash.legendValue(metricLabel(query.metric));
}

function axesOf(query: MetricQuery, rows: MetricRow[]): { rowDims: Dim[]; columnDims: Dim[] } {
  const time = timeDimOf(query);
  const groups = groupDimsOf(query);
  if (time) return { rowDims: groups, columnDims: [time] };
  const [first, second] = groups;
  if (!first || !second) return { rowDims: groups, columnDims: [] };
  const distinct = (dim: Dim) => new Set(rows.map((row) => row[dim])).size;
  return distinct(first) >= distinct(second) ? { rowDims: [first], columnDims: [second, ...groups.slice(2)] } : { rowDims: [second], columnDims: [first, ...groups.slice(2)] };
}

type RowOrder = "value_desc" | "value_asc" | "delta_asc" | "delta_desc";

function scoreOf(row: MetricRow, order: RowOrder): number {
  if (order === "delta_asc" || order === "delta_desc") return deltaPercentOf(row) ?? 0;
  return numericOf(row, "value") ?? 0;
}

/** Group keys in the order the question asked: by total value, or by the group's average change. */
function orderedKeys(rows: MetricRow[], dims: Dim[], order: RowOrder): string[] {
  const scores = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    const key = labelAlong(dims, row);
    if (key === null) continue;
    const entry = scores.get(key) ?? { sum: 0, count: 0 };
    scores.set(key, { sum: entry.sum + scoreOf(row, order), count: entry.count + 1 });
  }
  const averageChange = order === "delta_asc" || order === "delta_desc";
  const score = (key: string) => {
    const entry = scores.get(key) ?? { sum: 0, count: 1 };
    return averageChange ? entry.sum / entry.count : entry.sum;
  };
  const ascending = order === "value_asc" || order === "delta_asc";
  return [...scores.keys()].sort((left, right) => (ascending ? score(left) - score(right) : score(right) - score(left)));
}

/** A grid of groups × groups (or groups × time), each cell coloured by its value or by its change; the text always says what the colour says. */
export function heatmapBody(query: MetricQuery, rows: MetricRow[], order: RowOrder | null): CardBody {
  const { rowDims, columnDims } = axesOf(query, rows);
  const timeColumns = timeDimOf(query) !== null;
  const rowKeys = orderedKeys(rows, rowDims, order ?? "value_desc");
  const columnKeys = timeColumns ? bucketsOf(query, rows) : orderedKeys(rows, columnDims, "value_desc");
  const scale = scaleFor(query, rows);
  const paint = cellPainter(query, rows, scale);
  const byCell = new Map<string, MetricRow>();
  for (const row of rows) {
    const rowKey = labelAlong(rowDims, row);
    const columnKey = timeColumns ? String(row[columnDims[0]]) : labelAlong(columnDims, row);
    if (rowKey !== null && columnKey !== null) byCell.set(`${rowKey}\u0000${columnKey}`, row);
  }
  return {
    kind: "heatmap",
    rowLabels: rowKeys,
    columnLabels: timeColumns ? columnKeys.map(periodLabelTh) : columnKeys,
    cells: rowKeys.map((rowKey) =>
      columnKeys.map((columnKey) => {
        const row = byCell.get(`${rowKey}\u0000${columnKey}`);
        return row ? paint(row) : null;
      }),
    ),
    scale,
    legend: legendOf(query, scale),
  };
}

function sliceShare(value: number, total: number): number {
  return total === 0 ? 0 : value / total;
}

/** Parts of a whole: the largest parts as a donut, the rest folded into "อื่น ๆ"; a share metric (market share) is already parts of 100. */
export function shareBody(query: MetricQuery, rows: MetricRow[]): CardBody {
  const scored = rows
    .map((row) => ({ row, value: numericOf(row, "value") }))
    .filter((entry): entry is { row: MetricRow; value: number } => entry.value !== null && entry.value > 0)
    .sort((left, right) => right.value - left.value);
  const shown = scored.length > MAX_SLICES ? scored.slice(0, MAX_SLICES - 1) : scored;
  const rest = scored.length > MAX_SLICES ? scored.slice(MAX_SLICES - 1) : [];
  const total = scored.reduce((sum, entry) => sum + entry.value, 0);
  const alreadyShare = PERCENT_METRIC_SHARE.has(query.metric);
  const slices: ShareSlice[] = shown.map((entry) => {
    const share = sliceShare(entry.value, total);
    const delta = formatDelta(deltaPercentOf(entry.row));
    return {
      label: labelOf(query, entry.row),
      valueText: alreadyShare ? (delta ?? "") : valueTextOf(query, entry.row),
      share,
      shareText: alreadyShare ? valueTextOf(query, entry.row) : formatPercent(Math.round(share * 1000) / 10),
      isOther: false,
    };
  });
  if (rest.length > 0) {
    const restValue = rest.reduce((sum, entry) => sum + entry.value, 0);
    const share = sliceShare(restValue, total);
    slices.push({ label: TH.dash.others, valueText: formatMetricValue(query.metric, restValue), share, shareText: formatPercent(Math.round(share * 1000) / 10), isOther: true });
  }
  const leader = slices[0];
  return { kind: "share", slices, centerValue: leader?.shareText ?? "—", centerLabel: leader?.label ?? "" };
}

function median(values: number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];
}

function correlation(xs: number[], ys: number[]): number {
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const mx = mean(xs);
  const my = mean(ys);
  let top = 0;
  let sx = 0;
  let sy = 0;
  xs.forEach((x, index) => {
    top += (x - mx) * (ys[index] - my);
    sx += (x - mx) ** 2;
    sy += (ys[index] - my) ** 2;
  });
  return sx === 0 || sy === 0 ? 0 : top / Math.sqrt(sx * sy);
}

type Joined = { label: string; x: MetricRow; y: MetricRow };

/** Rows of two results that name the same thing along the same dims. */
export function joinedRows(first: Source, second: Source): Joined[] {
  const byLabel = new Map(second.result.rows.map((row) => [labelOf(second.query, row), row]));
  return first.result.rows.flatMap((row) => {
    const label = labelOf(first.query, row);
    const match = byLabel.get(label);
    return match && numericOf(row, "value") !== null && numericOf(match, "value") !== null ? [{ label, x: row, y: match }] : [];
  });
}

function axisOf(source: Source, values: number[]): ScatterAxis {
  const middle = median(values);
  return { label: metricLabel(source.query.metric), format: metricFormat(source.query.metric), median: middle, medianText: formatMetricValue(source.query.metric, middle) };
}

function correlationNote(xLabel: string, yLabel: string, r: number): string {
  const rounded = Math.round(r * 100) / 100;
  if (Math.abs(r) < STRONG_CORRELATION) return TH.dash.noCorrelation(rounded);
  return r > 0 ? TH.dash.positiveCorrelation(xLabel, yLabel, rounded) : TH.dash.negativeCorrelation(xLabel, yLabel, rounded);
}

function comparableScale(left: number, right: number): boolean {
  if (left <= 0 || right <= 0) return false;
  const ratio = left / right;
  return ratio <= PARITY_RATIO && ratio >= 1 / PARITY_RATIO;
}

/** Whether two metrics measure the same things in the same unit at the same scale, so the question is the gap between them rather than how they move together. */
export function isParityPair(first: Source, second: Source): boolean {
  const joined = joinedRows(first, second);
  if (!sameUnit([first, second]) || joined.length === 0) return false;
  return comparableScale(median(joined.map((entry) => numericOf(entry.x, "value") as number)), median(joined.map((entry) => numericOf(entry.y, "value") as number)));
}

/** Two metrics of the same things against each other: medians split the plot, the outliers are named, the note says how tightly they move together. */
export function scatterBody(first: Source, second: Source): CardBody {
  const joined = joinedRows(first, second);
  const xs = joined.map((entry) => numericOf(entry.x, "value") as number);
  const ys = joined.map((entry) => numericOf(entry.y, "value") as number);
  const x = axisOf(first, xs);
  const y = axisOf(second, ys);
  const xSpan = Math.max(...xs) - Math.min(...xs) || 1;
  const ySpan = Math.max(...ys) - Math.min(...ys) || 1;
  const distance = (index: number) => Math.hypot((xs[index] - x.median) / xSpan, (ys[index] - y.median) / ySpan);
  const named = new Set(
    joined
      .map((_, index) => index)
      .sort((left, right) => distance(right) - distance(left))
      .slice(0, MAX_NAMED_POINTS),
  );
  const points: ScatterPoint[] = joined.map((entry, index) => ({
    label: entry.label,
    x: xs[index],
    y: ys[index],
    xText: valueTextOf(first.query, entry.x),
    yText: valueTextOf(second.query, entry.y),
    named: named.has(index),
  }));
  return { kind: "scatter", points, x, y, note: correlationNote(x.label, y.label, correlation(xs, ys)) };
}

function shortLabel(source: Source): string {
  return metricLabel(source.query.metric).replace(PARENTHETICAL, "");
}

function gapPercent(base: number, other: number): number {
  return base === 0 ? 0 : ((other - base) / base) * PERCENT;
}

type Gap = { entry: Joined; percent: number };

function gapsOf(first: Source, second: Source): Gap[] {
  return joinedRows(first, second)
    .map((entry) => ({ entry, percent: gapPercent(numericOf(entry.x, "value") as number, numericOf(entry.y, "value") as number) }))
    .sort((left, right) => left.percent - right.percent);
}

function exactTextOf(source: Source, row: MetricRow): string {
  const unit = metricUnit(source.query.metric);
  const whole = formatWhole(numericOf(row, "value") as number);
  return unit ? `${whole} ${unit}` : whole;
}

function gapDetailOf(first: Source, second: Source, entry: Joined): string {
  const [base, other] = [valueTextOf(first.query, entry.x), valueTextOf(second.query, entry.y)];
  if (base !== other) return TH.dash.gapDetail(base, other);
  return TH.dash.gapDetail(exactTextOf(first, entry.x), exactTextOf(second, entry.y));
}

/** The same things measured twice in one unit (sell-in against sell-out): one bar per thing for how far the second is from the first, the widest shortfall first. */
export function gapBody(first: Source, second: Source): CardBody {
  const gaps = gapsOf(first, second);
  const shown = gaps.slice(0, MAX_GAP_ROWS);
  const peak = Math.max(...shown.map((gap) => Math.abs(gap.percent)), MIN_GAP_SCALE_PCT);
  const [base, other] = [shortLabel(first), shortLabel(second)];
  const rows: GapRow[] = shown.map(({ entry, percent }) => ({
    label: entry.label,
    gap: percent / peak,
    gapText: formatDelta(percent) ?? "0%",
    detail: gapDetailOf(first, second, entry),
    tone: toneOf(second.query.metric, percent),
  }));
  return {
    kind: "gap",
    rows,
    caption: TH.dash.gapCaption(base, other),
    shownOf: gaps.length > MAX_GAP_ROWS ? TH.dash.gapShownOf(MAX_GAP_ROWS, gaps.length) : null,
  };
}

/** The headline of a gap card: the second metric as a share of the first across everything shown, and how many fall well short. */
export function gapHero(first: Source, second: Source, unit: string | null): CardHero | null {
  const additive = first.result.headline.aggregate === "sum" && second.result.headline.aggregate === "sum";
  const gaps = gapsOf(first, second);
  if (!additive || gaps.length === 0) return null;
  const total = (source: "x" | "y") => gaps.reduce((sum, gap) => sum + (numericOf(gap.entry[source], "value") ?? 0), 0);
  const overall = gapPercent(total("x"), total("y"));
  const short = gaps.filter((gap) => gap.percent <= -WIDE_GAP_PCT).length;
  const [base, other] = [shortLabel(first), shortLabel(second)];
  return {
    label: TH.dash.gapHeroLabel(other, base),
    value: formatPercent(Math.round((PERCENT + overall) * 10) / 10),
    delta: null,
    trend: directionOf(overall),
    tone: toneOf(second.query.metric, overall),
    detail: short > 0 ? TH.dash.gapShortCount(short, gaps.length, unit ?? "", other, base, WIDE_GAP_PCT) : TH.dash.gapNoneShort(unit ?? "", other, base, WIDE_GAP_PCT),
  };
}

/** Stages of one flow in the same unit (produced → sold in → sold out), each bar sized against the first, with what was lost between stages. */
export function funnelBody(sources: Source[]): CardBody {
  const stages = sources.map((source) => ({ source, value: numericOf(source.result.rows[0] ?? {}, "value") ?? 0 }));
  const peak = Math.max(...stages.map((stage) => stage.value), 0);
  return {
    kind: "funnel",
    stages: stages.map((stage, index) => {
      const previous = index > 0 ? stages[index - 1].value : null;
      const change = previous ? ((stage.value - previous) / previous) * PERCENT : null;
      return {
        label: metricLabel(stage.source.query.metric).replace(PARENTHETICAL, ""),
        value: stage.value,
        valueText: stage.source.result.headline.value,
        width: peak === 0 ? 0 : stage.value / peak,
        dropText: change === null ? null : TH.dash.fromPreviousStage(formatDelta(change) ?? "0%"),
        dropTone: "neutral" as Tone,
      };
    }),
  };
}

export function sameUnit(sources: Source[]): boolean {
  return new Set(sources.map((source) => metricUnit(source.query.metric))).size === 1;
}

/** Other metrics over the same time axis as extra lines; when the units differ every line is indexed to its first bucket = 100. */
export function overlaidLines(first: Source, others: Source[]): CardBody {
  const dim = timeDimOf(first.query);
  const buckets = dim ? [...new Set(first.result.rows.map((row) => String(row[dim])))].sort() : [];
  const indexed = !sameUnit([first, ...others]);
  const seriesOf = (source: Source): ChartSeries => {
    const sourceDim = timeDimOf(source.query);
    const byBucket = new Map(source.result.rows.map((row) => [String(sourceDim ? row[sourceDim] : ""), numericOf(row, "value")]));
    const values = buckets.map((bucket) => byBucket.get(bucket) ?? null);
    const base = values.find((value): value is number => value !== null && value !== 0) ?? null;
    return {
      name: metricLabel(source.query.metric),
      values: indexed ? values.map((value) => (value === null || base === null ? null : Math.round((value / base) * 1000) / 10)) : values,
      style: null,
    };
  };
  return {
    kind: "line",
    labels: buckets.map(periodLabelTh),
    series: [first, ...others].slice(0, MAX_SERIES).map(seriesOf),
    format: indexed ? "number" : metricFormat(first.query.metric),
  };
}

export function isIndexedOverlay(first: Source, others: Source[]): boolean {
  return !sameUnit([first, ...others]);
}
