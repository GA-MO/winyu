import { WIDGET_KINDS, type Alert, type AlertRow, type Dim, type Forecast, type MetricId, type MetricQuery, type MetricResult, type MetricRow, type NextAction, type UnderLine, type WidgetKind } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { MIN_CELL_SIZE } from "@/lib/access/suppression";
import { addDays, monthKeyOfIso, weekKeyOfIso } from "@/lib/data/dates";
import { DECIDING_LINES, LOW_COVER_DAYS } from "@/lib/semantic/metrics";
import { formatDateTh, formatPercent, periodLabelTh } from "@/lib/i18n/format";
import { changeTextOf, deltaPercentOf, deltaPointsOf, groupDimsOf, labelAlong, labelOf, numericOf, timeDimOf, valueTextOf } from "./rows";
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
  changeDirectionOf,
  changeToneOf,
  formatChange,
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

export type CardHero = { label: string; value: string; delta: string | null; trend: Direction; tone: Tone; detail: string | null; note: string | null };
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
export type GapRow = { label: string; gap: number; gapText: string; detail: string | null; tone: Tone };
export type GapEnds = { less: string; more: string };
export type FunnelStage = { label: string; value: number; valueText: string; width: number; dropText: string | null; dropTone: Tone };
/** A row a shared card holds back from its viewer: its name only, never a value, a change, a share or a rank. */
export type LockedRow = { label: string };

/** The rows a shared card holds back along its one breakdown: names in the dimension's fixed order, and where asking for them goes (null when nobody may be asked now). */
export type LockedRows = { dim: Dim; labels: string[]; askHref: string | null };

export type CardBody =
  | { kind: "none" }
  | { kind: "rank"; rows: RankRow[]; showRank: boolean }
  | { kind: "locked"; rows: RankRow[]; locked: LockedRow[]; askHref: string | null }
  | { kind: "progress"; value: number; detail: string }
  | { kind: "line"; labels: string[]; series: ChartSeries[]; format: MetricFormat }
  | { kind: "stacked"; shape: "bar" | "area"; labels: string[]; series: ChartSeries[]; format: MetricFormat }
  | { kind: "share"; slices: ShareSlice[]; centerValue: string; centerLabel: string }
  | { kind: "heatmap"; rowLabels: string[]; columnLabels: string[]; cells: (HeatCell | null)[][]; scale: ColorScale; legend: string }
  | { kind: "scatter"; points: ScatterPoint[]; x: ScatterAxis; y: ScatterAxis; note: string | null }
  | { kind: "gap"; rows: GapRow[]; ends: GapEnds; caption: string | null; shownOf: string | null }
  | { kind: "funnel"; stages: FunnelStage[] }
  | { kind: "table"; columns: CardColumn[]; rows: Record<string, string>[] }
  | { kind: "alerts"; items: SignalItem[]; more: SignalItem[] }
  | { kind: "forecast"; labels: string[]; actual: (number | null)[]; forecast: (number | null)[]; lo: (number | null)[]; hi: (number | null)[]; format: MetricFormat };

/** The warning a card shows in place of its data: a heading and one line, both written for the person. */
export type RefusalNotice = { title: string; body: string };

/** What a refusal tells the person. The server's own words show only where they are written for people: a scope denial, an admin rule, or a domain refusal without a code (not found, already enrolled). Every other code (BAD_QUERY, TIMEOUT, RUN_LIMIT, …) carries text written for the model, so the person gets a neutral line instead. */
export function refusalNoticeOf(code: unknown, error: string): RefusalNotice {
  if (typeof code === "string" && SCOPE_CODES.has(code)) return { title: TH.dash.denied, body: error };
  if (code === RULE_CODE || code === undefined || code === null) return { title: TH.cards.refused, body: error };
  const title = typeof code === "string" && UNAVAILABLE_CODES.has(code) ? TH.cards.failed.unavailableTitle : TH.cards.failed.title;
  return { title, body: (typeof code === "string" ? FAILED_LINES[code] : undefined) ?? TH.cards.failed.other };
}

export type CardParts = {
  title: string;
  meta: string | null;
  description: string | null;
  footnote: string | null;
  hero: CardHero | null;
  body: CardBody;
  actions: NextAction[];
  denied: RefusalNotice | null;
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
  locked?: LockedRows | null;
};

export type PresentSource = { query: MetricQuery; result: MetricResult };

const SCOPE_CODES: ReadonlySet<string> = new Set(["PERMISSION_DENIED", "TOOL_NOT_ALLOWED"]);
const RULE_CODE = "POLICY_RULE";
const UNAVAILABLE_CODES: ReadonlySet<string> = new Set(["UNAVAILABLE", "CONNECTOR_UNAVAILABLE"]);
const FAILED_LINES: Record<string, string> = {
  TIMEOUT: TH.cards.failed.timeout,
  UNAVAILABLE: TH.cards.failed.unavailable,
  CONNECTOR_UNAVAILABLE: TH.cards.failed.unavailable,
  RUN_LIMIT: TH.cards.failed.runLimit,
  VERIFICATION_FAILED: TH.cards.failed.withheld,
};

const MAX_TABLE_ROWS = 8;
const PROGRESS_METRICS: ReadonlySet<MetricId> = new Set(["target_attainment"]);
const WORST_WHEN_LOW: ReadonlySet<MetricId> = new Set(["target_attainment", "days_of_cover"]);
const WORST_WHEN_HIGH: ReadonlySet<MetricId> = new Set(["ar_overdue", "forecast_mape"]);
const MAX_RANK_ROWS = 8;
const MAX_ALERTS = 4;
const MAX_HISTORY_POINTS = 12;
const MASKED = "***";
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
const MIN_CHANGE_SPAN_PCT = 10;

/** A level read against a line rather than from zero: how far either side still reads as a bar, which tone the good side wears, what the headline calls the groups under the line, and what it says when none is. */
type LevelLine = { at: number; minSpan: number; aboveTone: Tone; ends: GapEnds; caption: string; underLabel: string; noneUnder: string };

const TARGET_LINE: LevelLine = {
  at: DECIDING_LINES.target_attainment ?? PERCENT,
  minSpan: 10,
  aboveTone: "good",
  ends: { less: TH.dash.belowTarget, more: TH.dash.aboveTarget },
  caption: TH.dash.targetLine,
  underLabel: TH.dash.underTarget,
  noneUnder: TH.dash.noneBelow(TH.dash.target),
};

const LEVEL_LINES: Partial<Record<MetricId, LevelLine>> = {
  target_attainment: TARGET_LINE,
  days_of_cover: {
    at: LOW_COVER_DAYS,
    minSpan: 5,
    aboveTone: "neutral",
    ends: { less: TH.dash.belowCover(LOW_COVER_DAYS), more: TH.dash.aboveCover },
    caption: TH.dash.coverLine(LOW_COVER_DAYS),
    underLabel: TH.dash.underCover(LOW_COVER_DAYS),
    noneUnder: TH.dash.noneBelow(TH.dash.days(LOW_COVER_DAYS)),
  },
};

function rankDimOf(query: MetricQuery): Dim | null {
  return groupDimsOf(query)[0] ?? null;
}

function endsOnFullBucket(grain: MetricQuery["grain"], lastDay: string): boolean {
  if (grain === "month") return monthKeyOfIso(addDays(lastDay, 1)) !== monthKeyOfIso(lastDay);
  if (grain === "week") return new Date(`${lastDay}T00:00:00Z`).getUTCDay() === SUNDAY;
  return true;
}

/** The bucket still running on the last day the data holds: a range asked to the end of September is still cut on the day the data stops. */
function partialBucketKey(query: MetricQuery, asOf: string): string | null {
  const lastDay = query.range.to < asOf ? query.range.to : asOf;
  if (endsOnFullBucket(query.grain, lastDay)) return null;
  if (query.grain === "month") return monthKeyOfIso(lastDay);
  if (query.grain === "week") return weekKeyOfIso(lastDay);
  return null;
}

const TIME_BODIES: ReadonlySet<CardView> = new Set(["line", "stacked", "area", "heatmap"]);

/** A trend whose last bucket is the running week or month drops that bucket and says so, instead of falling off a cliff. */
function withoutPartialBucket(query: MetricQuery, view: CardView, rows: MetricRow[], asOf: string): { rows: MetricRow[]; note: string | null } {
  if (!TIME_BODIES.has(view) || rows.length < 2) return { rows, note: null };
  const dim = timeDimOf(query);
  const key = partialBucketKey(query, asOf);
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

type OkResult = Extract<MetricResult, { ok: true }>;

/** What the card leads with: the total, the one row it has, the share of target, the row that moved or ranks first, the weakest row, how many sit under a line, or the latest full bucket. */
type HeroKind = "total" | "single" | "attainment" | "mover" | "leader" | "weakest" | "underCount" | "latest";

/** Which bars a breakdown draws: the change, the distance from a deciding line, value against target around 100%, or the level from zero; `auto` picks from the sort and the line. */
type Bars = "auto" | "change" | "level" | "target" | "rank";

/** Everything the decision table reads: the query's intent (compare, sort, limit, where, dims, grain), the rows it got, and the metric's level line. */
type Facts = Shape & { result: OkResult; groups: number; time: boolean; buckets: number; line: LevelLine | null; under: UnderLine | null; capped: boolean; filtered: boolean };

/** One row of the decision table: when it applies, the form it draws and the hero that answers. */
type CardRule = { rule: string; when: (facts: Facts) => boolean; view: (facts: Facts) => CardView; bars: Bars; hero: HeroKind };

const MIN_LINE_BUCKETS = 3;

function hasChange(rows: MetricRow[]): boolean {
  return rows.some((row) => deltaPercentOf(row) !== null);
}

function sortsByValue(sortBy: SortBy | null): boolean {
  return sortBy === "value_desc" || sortBy === "value_asc";
}

function wholeOrBars(facts: Facts): CardView {
  return isPartOfWhole(facts) && !asksAboutChange(facts.sortBy) ? "share" : "bar";
}

const always = (view: CardView) => () => view;

/** The one decision table: the first rule whose condition holds decides the card's form and what its hero answers. */
const CARD_RULES: readonly CardRule[] = [
  { rule: "R7 threshold met by few", when: (f) => Boolean(f.query.where) && f.under !== null && f.groups === 1 && !f.time && f.rows.length > 0, view: always("bar"), bars: "level", hero: "underCount" },
  { rule: "R1 one row", when: (f) => f.rows.length <= 1 && (f.query.dims.length > 0 || f.filtered), view: always("metric"), bars: "auto", hero: "single" },
  { rule: "R2 short series", when: (f) => f.time && f.groups === 0 && f.buckets < MIN_LINE_BUCKETS, view: always("metric"), bars: "auto", hero: "total" },
  { rule: "R9 trend", when: (f) => f.time && f.groups === 0, view: always("line"), bars: "auto", hero: "latest" },
  { rule: "time × group", when: (f) => f.time, view: timeView, bars: "auto", hero: "total" },
  { rule: "R4 two groups sorted by change", when: (f) => f.groups >= 2 && !isDenseGrid(f) && asksAboutChange(f.sortBy) && hasChange(f.rows), view: always("bar"), bars: "change", hero: "mover" },
  { rule: "two groups", when: (f) => f.groups >= 2, view: (f) => (isDenseGrid(f) ? "heatmap" : "bar"), bars: "auto", hero: "total" },
  { rule: "no breakdown", when: (f) => f.groups === 0 || f.rows.length < RANK_MIN_ROWS, view: (f) => (f.rows.length <= 1 ? "metric" : "table"), bars: "auto", hero: "total" },
  { rule: "R6 under the line", when: (f) => f.line !== null && f.under !== null && f.under.count > 0, view: always("bar"), bars: "level", hero: "underCount" },
  { rule: "R6 nothing under the line", when: (f) => f.line !== null && f.under !== null, view: always("bar"), bars: "level", hero: "weakest" },
  { rule: "R4 sorted by change", when: (f) => asksAboutChange(f.sortBy) && hasChange(f.rows), view: always("bar"), bars: "change", hero: "mover" },
  { rule: "R3 against target", when: (f) => f.query.compare === "target" && hasChange(f.rows), view: always("bar"), bars: "target", hero: "attainment" },
  { rule: "R5 top of a ranking", when: (f) => sortsByValue(f.sortBy) && (!f.additive || f.capped), view: wholeOrBars, bars: "auto", hero: "leader" },
  { rule: "breakdown", when: () => true, view: wholeOrBars, bars: "auto", hero: "total" },
];

type Fit = { rule: string; view: CardView; bars: Bars; hero: HeroKind };

function factsOf(shape: Shape, result: OkResult): Facts {
  const { query, rows } = shape;
  const time = timeDimOf(query) !== null;
  return {
    ...shape,
    result,
    groups: groupDimsOf(query).length,
    time,
    buckets: time ? bucketCountOf(query, rows) : 0,
    line: LEVEL_LINES[query.metric] ?? null,
    under: result.headline.underLine ?? null,
    capped: isCapped(query, rows.length),
    filtered: scopeLabelsOf(query, result).length > 0,
  };
}

function fitOf(facts: Facts): Fit {
  const rule = CARD_RULES.find((candidate) => candidate.when(facts)) ?? CARD_RULES[CARD_RULES.length - 1];
  return { rule: rule.rule, view: rule.view(facts), bars: rule.bars, hero: rule.hero };
}

/** The widget kind a result is drawn as when nobody asks for one, so a pinned card looks like the card it was pinned from. */
export function widgetKindFor(query: MetricQuery, result: MetricResult): WidgetKind {
  if (!result.ok) return "metric";
  const { view } = fitOf(factsOf({ query, rows: result.rows, additive: result.headline.aggregate === "sum", sortBy: null }, result));
  return WIDGET_KINDS.includes(view as WidgetKind) ? (view as WidgetKind) : "table";
}

/** Which body a result is drawn as: alerts and masked values first, then a view someone asked for when the data can fill it, else the decision table's. */
function viewFor(shape: Shape, requested: CardView, masked: boolean, extras: CardExtras, fit: Fit): CardView {
  if (extras.alerts && extras.alerts.length > 0) return "alert_list";
  if (masked) return "kv";
  if (requested !== "auto" && canDraw(requested, shape)) return requested;
  return fit.view;
}

function groupCountFor(query: MetricQuery, rows: MetricRow[], rowCount: number): number {
  const dim = rankDimOf(query);
  if (!dim || (!timeDimOf(query) && groupDimsOf(query).length === 1)) return rowCount;
  return new Set(rows.map((row) => row[dim])).size;
}

function isCapped(query: MetricQuery, rowCount: number): boolean {
  return query.limit !== null && rowCount >= query.limit;
}

function rowsLineOf(query: MetricQuery, rowCount: number, drawn: number | null): string | null {
  const dim = rankDimOf(query);
  const unit = dim ? TH.dash.dimUnit[dim] : null;
  if (!unit || rowCount <= 1) return null;
  if (drawn !== null && drawn < rowCount) return TH.dash.shownRowsOf(drawn, rowCount, unit);
  return isCapped(query, rowCount) ? TH.dash.shownRows(rowCount, unit) : `${rowCount} ${unit}`;
}

/** How many rows of a one-dimension breakdown the body draws, when it draws a list; the scope line then says it shows fewer than the result holds. */
function drawnRowsOf(query: MetricQuery, body: CardBody): number | null {
  if (timeDimOf(query) || groupDimsOf(query).length !== 1) return null;
  if (body.kind === "rank" || body.kind === "gap" || body.kind === "table") return body.rows.length;
  return null;
}

function hiddenLineOf(query: MetricQuery, hidden: number): string | null {
  if (hidden === 0) return null;
  const dim = rankDimOf(query);
  return TH.dash.hiddenSmall(hidden, dim ? TH.dash.dimUnit[dim] : TH.dash.item, MIN_CELL_SIZE);
}

/** Period, what the model narrowed the question to, how many groups the card lists, and how many it leaves out because they are too small to show. */
function scopeOf(query: MetricQuery, rowCount: number, drawn: number | null, periodLabel: string, filterLabels: readonly string[], hidden: number): string {
  const filtered = filterLabels.length > 0 ? TH.dash.filteredTo(filterLabels.join(", ")) : null;
  const rows = rowsLineOf(query, rowCount, drawn);
  return TH.dash.scope(periodLabel, [filtered, rows, hiddenLineOf(query, hidden)].filter((part): part is string => part !== null).join(" · ") || null);
}

/** What the person narrowed the question to (an agent, a brand), without the value threshold a `where` adds to the same list. */
function scopeLabelsOf(query: MetricQuery, result: OkResult): readonly string[] {
  const labels = result.provenance.filterLabels ?? [];
  return query.where ? labels.slice(0, -1) : labels;
}

/** A breakdown's headline stands for every group in scope, not only the rows the card lists; the label says which, and a total over everything the person may see says so. */
function heroLabelOf(query: MetricQuery, result: Extract<MetricResult, { ok: true }>): string {
  const label = metricLabel(query.metric);
  const dim = rankDimOf(query);
  if (!dim && !timeDimOf(query) && scopeLabelsOf(query, result).length === 0) return TH.dash.wholeScope(label, result.headline.aggregate === "average");
  if (!dim || timeDimOf(query) || result.rows.length <= 1) return label;
  const unit = TH.dash.dimUnit[dim];
  return result.headline.aggregate === "average" ? TH.dash.averageAcross(label, unit) : TH.dash.totalAcross(label, unit);
}

function footnoteOf(result: Extract<MetricResult, { ok: true }>, extraNote: string | null, hidden: number): string {
  const trust = TH.dash.trust[result.provenance.trust];
  const masked = result.provenance.masked.length > 0 && hidden === 0 ? TH.dash.maskedNote(result.provenance.masked.length) : null;
  const gap = result.provenance.coverage?.label ?? null;
  return [TH.dash.provenance(result.provenance.sourceSystem, trust, formatDateTh(result.provenance.asOf)), gap, masked, result.headline.compareNote, extraNote]
    .filter((line): line is string => line !== null)
    .join(" · ");
}

function lastDayOfMonth(iso: string): string {
  return addDays(`${addDays(`${monthKeyOfIso(iso)}-28`, 4).slice(0, 7)}-01`, -1);
}

/** Against a target in a month still running, 100% means on pace to date: the line names the day the target is counted to and how much of the whole month that is. */
function paceNoteOf(query: MetricQuery, asOf: string): string | null {
  if (!PROGRESS_METRICS.has(query.metric) && query.compare !== "target") return null;
  const through = query.range.to < asOf ? query.range.to : asOf;
  const monthEnd = lastDayOfMonth(through);
  if (through === monthEnd || query.range.from > `${monthKeyOfIso(through)}-01`) return null;
  const share = (Number(through.slice(8)) / Number(monthEnd.slice(8))) * PERCENT;
  return TH.dash.paceTarget(formatDateTh(through), formatPercent(Math.round(share)));
}

function joined(parts: readonly (string | null)[]): string | null {
  return parts.filter((part): part is string => part !== null && part !== "").join(" · ") || null;
}

function projectionNote(result: OkResult): string | null {
  return result.headline.projection ? TH.dash.monthEnd(result.headline.projection) : null;
}

function heroNoteOf(query: MetricQuery, result: Extract<MetricResult, { ok: true }>, rows: MetricRow[]): string | null {
  const weakest = weakestRow(query, result);
  const listedFirst = rows[0] ? labelOf(query, rows[0]) : null;
  return joined([weakest && weakest.label !== listedFirst ? TH.dash.weakest(weakest.lowIsWorst, weakest.label, weakest.value) : null, projectionNote(result)]);
}

type Move = { delta: string | null; trend: Direction; tone: Tone };

function againstTarget(deltaPercent: number | null): Pick<Move, "trend" | "tone"> {
  if (deltaPercent === null || deltaPercent === 0) return { trend: "neutral", tone: deltaPercent === 0 ? "good" : "neutral" };
  return deltaPercent < 0 ? { trend: "down", tone: "bad" } : { trend: "up", tone: "good" };
}

/** A change as a card writes it: in points for a percent metric, and judged against the 100% line when the comparison is a target, so 1.4% under target never reads grey. */
function moveOf(query: MetricQuery, deltaPercent: number | null, deltaPoints: number | null): Move {
  const delta = formatChange(query.metric, deltaPercent, deltaPoints);
  if (query.compare === "target") return { delta, ...againstTarget(deltaPercent) };
  return { delta, trend: changeDirectionOf(query.metric, deltaPercent, deltaPoints), tone: changeToneOf(query.metric, deltaPercent, deltaPoints) };
}

function rowMoveOf(query: MetricQuery, row: MetricRow): Move {
  return moveOf(query, deltaPercentOf(row), deltaPointsOf(row));
}

function headlineMoveOf(query: MetricQuery, result: OkResult): Move {
  return moveOf(query, result.headline.deltaPercent, result.headline.deltaPoints ?? null);
}

function heroOf(query: MetricQuery, result: Extract<MetricResult, { ok: true }>, rows: MetricRow[]): CardHero {
  return {
    label: heroLabelOf(query, result),
    value: result.headline.value,
    ...headlineMoveOf(query, result),
    detail: paceNoteOf(query, result.provenance.asOf) ?? result.headline.compareLabel,
    note: heroNoteOf(query, result, rows),
  };
}

/** The total a hero that names one row moves to its note: the headline with its own change. */
function totalNoteOf(query: MetricQuery, result: OkResult): string {
  return TH.dash.overall(heroLabelOf(query, result), [result.headline.value, headlineMoveOf(query, result).delta].filter((part): part is string => part !== null).join(" "));
}

type LatestBucket = { label: string; value: string; deltaPercent: number; deltaPoints: number; versus: string };

/** A series with no breakdown is read at its latest full bucket against the one before: a sum always (the range total moves to the note), a rate when nothing else is compared; the total or average of the whole line hides the turn someone asked about. */
function latestBucketOf(query: MetricQuery, result: Extract<MetricResult, { ok: true }>, rows: MetricRow[]): LatestBucket | null {
  if (result.headline.aggregate === "average" && result.headline.deltaPercent !== null) return null;
  if (!timeDimOf(query) || groupDimsOf(query).length > 0 || rows.length < 2) return null;
  const [previous, latest] = rows.slice(-2);
  const previousValue = numericOf(previous, "value");
  const latestValue = numericOf(latest, "value");
  if (previousValue === null || latestValue === null || previousValue === 0) return null;
  return {
    label: labelOf(query, latest),
    value: valueTextOf(query, latest),
    deltaPercent: ((latestValue - previousValue) / Math.abs(previousValue)) * PERCENT,
    deltaPoints: latestValue - previousValue,
    versus: TH.dash.versusBucket(labelOf(query, previous)),
  };
}

function fullBucketRows(query: MetricQuery, rows: MetricRow[], asOf: string): MetricRow[] {
  return withoutPartialBucket(query, "line", rows, asOf).rows;
}

/** The change a card leads with, the same one its hero shows: the latest full bucket for a series, the headline comparison otherwise. */
export function headlineChangeOf(query: MetricQuery, result: MetricResult): { deltaPercent: number | null; deltaPoints: number | null; compareLabel: string | null } {
  if (!result.ok) return { deltaPercent: null, deltaPoints: null, compareLabel: null };
  const latest = latestBucketOf(query, result, fullBucketRows(query, result.rows, result.provenance.asOf));
  if (latest) return { deltaPercent: latest.deltaPercent, deltaPoints: latest.deltaPoints, compareLabel: latest.versus };
  return { deltaPercent: result.headline.deltaPercent, deltaPoints: result.headline.deltaPoints ?? null, compareLabel: result.headline.compareLabel };
}

function unitOf(query: MetricQuery): string {
  const dim = rankDimOf(query);
  return dim && groupDimsOf(query).length === 1 ? TH.dash.dimUnit[dim] : TH.dash.item;
}

/** A breakdown judged against a line leads with how many groups sit under it, from every group in scope, then names the worst and the overall level, so "how many days does it last" is still answered; asked only for the rows under the line, the card lists them, so the level of those rows is left out. */
function underLineHero(query: MetricQuery, result: Extract<MetricResult, { ok: true }>, line: LevelLine, under: UnderLine): CardHero {
  const unit = unitOf(query);
  const weakest = weakestRow(query, result);
  const overall = query.where ? null : TH.dash.overall(heroLabelOf(query, result), result.headline.value);
  return {
    label: line.underLabel,
    value: under.count > 0 ? TH.dash.countOf(under.count, under.of, unit) : TH.dash.noneUnder,
    delta: null,
    trend: "neutral",
    tone: "neutral",
    detail: joined([under.count > 0 ? null : TH.dash.ofAll(under.of, unit), paceNoteOf(query, result.provenance.asOf)]),
    note: joined([weakest ? TH.dash.weakest(weakest.lowIsWorst, weakest.label, weakest.value) : null, overall, projectionNote(result)]),
  };
}

/** R1: one row, named. A breakdown or filter that left one row labels the hero with that row, so "3.9 ล้านลิตร" says which region it is. */
function singleHero(facts: Facts): CardHero {
  const { query, result, rows } = facts;
  const total = heroOf(query, result, rows);
  const row = rows[0];
  const name = (row ? labelAlong(query.dims, row) : null) ?? scopeLabelsOf(query, result).join(", ");
  return name ? { ...total, label: TH.dash.ownScope(metricLabel(query.metric), name) } : total;
}

function attainmentOf(row: MetricRow): number | null {
  const delta = deltaPercentOf(row);
  return delta === null ? null : PERCENT + delta;
}

function percentText(value: number): string {
  return formatPercent(Math.round(value * 10) / 10);
}

/** R3: compared with a target, the hero is how much of the target the whole scope reached, coloured by the 100% line; how many groups sit under it, the furthest under and the total move to the note. */
function attainmentHero(facts: Facts): CardHero {
  const { query, result, rows } = facts;
  const total = heroOf(query, result, rows);
  const delta = result.headline.deltaPercent;
  if (delta === null) return total;
  const scored = rows.flatMap((row) => {
    const value = attainmentOf(row);
    return value === null ? [] : [{ label: labelOf(query, row), value }];
  });
  const under = scored.filter((entry) => entry.value < PERCENT);
  const worst = under.reduce<{ label: string; value: number } | null>((low, entry) => (low === null || entry.value < low.value ? entry : low), null);
  return {
    ...total,
    value: TH.dash.ofTarget(percentText(PERCENT + delta)),
    note: joined([
      under.length > 0 ? TH.dash.countUnderTarget(under.length, scored.length, unitOf(query)) : TH.dash.allOnTarget(unitOf(query)),
      worst ? TH.dash.weakest(true, worst.label, percentText(worst.value)) : null,
      TH.dash.overall(heroLabelOf(query, result), result.headline.value),
      projectionNote(result),
    ]),
  };
}

function moverWordOf(sortBy: SortBy | null, deltaPercent: number): string {
  if (sortBy === "delta_desc") return deltaPercent > 0 ? TH.dash.mover.roseMost : TH.dash.mover.fellLeast;
  return deltaPercent < 0 ? TH.dash.mover.fellMost : TH.dash.mover.roseLeast;
}

/** R4: ranked by change, the hero is the row that moved first in that order, its level beside its change; the total moves to the note. */
function moverHero(facts: Facts): CardHero {
  const { query, result, rows, sortBy } = facts;
  const first = rows.find((row) => deltaPercentOf(row) !== null);
  const delta = first ? deltaPercentOf(first) : null;
  if (!first || delta === null) return heroOf(query, result, rows);
  return {
    label: TH.dash.rowHero(moverWordOf(sortBy, delta), labelOf(query, first)),
    value: valueTextOf(query, first),
    ...rowMoveOf(query, first),
    detail: TH.dash.compare[query.compare] || null,
    note: joined([totalNoteOf(query, result), projectionNote(result)]),
  };
}

/** R5: a ranking by value leads with its first row; the total or the average across rows moves to the note. */
function leaderHero(facts: Facts): CardHero {
  const { query, result, rows, sortBy } = facts;
  const first = rows[0];
  if (!first) return heroOf(query, result, rows);
  const move = rowMoveOf(query, first);
  const value = valueTextOf(query, first);
  return {
    label: TH.dash.rowHero(sortBy === "value_asc" ? TH.dash.lowest : TH.dash.highest, labelOf(query, first)),
    value,
    ...move,
    detail: move.delta ? TH.dash.compare[query.compare] || null : paceNoteOf(query, result.provenance.asOf),
    note: joined([result.headline.value === value ? null : totalNoteOf(query, result), projectionNote(result)]),
  };
}

/** R6: a metric with a level line and nothing under it leads with its weakest row and says nothing is under the line. */
function weakestHero(facts: Facts): CardHero {
  const { query, result, rows, line } = facts;
  const weakest = weakestRow(query, result);
  if (!weakest || !line) return heroOf(query, result, rows);
  return {
    label: TH.dash.rowHero(weakest.lowIsWorst ? TH.dash.lowest : TH.dash.highest, weakest.label),
    value: weakest.value,
    delta: null,
    trend: "neutral",
    tone: line.aboveTone,
    detail: line.noneUnder,
    note: joined([TH.dash.overall(heroLabelOf(query, result), result.headline.value), paceNoteOf(query, result.provenance.asOf), projectionNote(result)]),
  };
}

/** R9: a series leads with its latest full bucket against the one before; the range total and its comparison move to the note. */
function latestHero(facts: Facts): CardHero {
  const { query, result, rows } = facts;
  const latest = latestBucketOf(query, result, rows);
  if (!latest) return heroOf(query, result, rows);
  const range = result.headline.aggregate === "sum" ? TH.dash.rangeTotal([result.headline.value, headlineMoveOf(query, result).delta, result.headline.compareLabel].filter((part): part is string => part !== null).join(" ")) : null;
  return {
    label: TH.dash.atBucket(metricLabel(query.metric), latest.label),
    value: latest.value,
    delta: formatChange(query.metric, latest.deltaPercent, latest.deltaPoints),
    trend: changeDirectionOf(query.metric, latest.deltaPercent, latest.deltaPoints),
    tone: changeToneOf(query.metric, latest.deltaPercent, latest.deltaPoints),
    detail: latest.versus,
    note: range,
  };
}

function underCountHero(facts: Facts): CardHero {
  const { query, result, rows, line, under } = facts;
  return line && under ? underLineHero(query, result, line, under) : heroOf(query, result, rows);
}

const HEROES: Record<HeroKind, (facts: Facts) => CardHero> = {
  total: (facts) => heroOf(facts.query, facts.result, facts.rows),
  single: singleHero,
  attainment: attainmentHero,
  mover: moverHero,
  leader: leaderHero,
  weakest: weakestHero,
  underCount: underCountHero,
  latest: latestHero,
};

/** Bars measure the number printed beside them; a list ordered by what fell keeps that order and shows the change in the pill. */
function rankRowsOf(query: MetricQuery, rows: MetricRow[]): RankRow[] {
  const shown = rows.slice(0, MAX_RANK_ROWS);
  const values = shown.map((row) => numericOf(row, "value") ?? 0);
  const peak = Math.max(...values.map(Math.abs), 0);
  return shown.map((row, index) => ({
    label: labelOf(query, row),
    value: valueTextOf(query, row),
    share: peak === 0 ? null : Math.abs(values[index]) / peak,
    ...rowMoveOf(query, row),
    note: null,
  }));
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
      ...(withCompare ? { delta: changeTextOf(query.metric, row) ?? "—" } : {}),
    })),
  };
}

/** R1's body: a Meter of the one row against its target (attainment itself, or value over target), or nothing when there is no target. */
function meterBody(query: MetricQuery, rows: MetricRow[]): CardBody {
  const [row] = rows;
  if (!row) return { kind: "none" };
  const value = PROGRESS_METRICS.has(query.metric) ? numericOf(row, "value") : query.compare === "target" ? attainmentOf(row) : null;
  if (value === null) return { kind: "none" };
  const remaining = Math.round((PERCENT - value) * 10) / 10;
  return {
    kind: "progress",
    value: Math.max(0, Math.min(PERCENT, value)),
    detail: remaining > 0 ? TH.dash.toTarget(formatPercent(remaining)) : TH.dash.targetMet,
  };
}

/** A list ranked by how much each row moved draws the move: bars left for less, right for more, the level itself beside the name. */
function changeBody(query: MetricQuery, rows: MetricRow[]): CardBody {
  const shown = rows.slice(0, MAX_RANK_ROWS);
  const deltas = shown.map(deltaPercentOf);
  const span = Math.max(MIN_CHANGE_SPAN_PCT, ...deltas.map((delta) => Math.abs(delta ?? 0)));
  return {
    kind: "gap",
    rows: shown.map((row, index) => ({
      label: labelOf(query, row),
      gap: (deltas[index] ?? 0) / span,
      gapText: changeTextOf(query.metric, row) ?? "—",
      detail: valueTextOf(query, row),
      tone: rowMoveOf(query, row).tone,
    })),
    ends: { less: TH.dash.changeLess, more: TH.dash.changeMore },
    caption: TH.dash.changeCaption(TH.dash.compare[query.compare] ?? ""),
    shownOf: null,
  };
}

function levelToneOf(value: number, line: LevelLine): Tone {
  return value < line.at ? "bad" : line.aboveTone;
}

type LevelPoint = { row: MetricRow; value: number | null; text: string; detail: string | null };

function gapRowsOf(query: MetricQuery, points: LevelPoint[], line: LevelLine): GapRow[] {
  const span = Math.max(line.minSpan, ...points.map((point) => (point.value === null ? 0 : Math.abs(point.value - line.at))));
  return points.map((point) => ({
    label: labelOf(query, point.row),
    gap: point.value === null ? 0 : (point.value - line.at) / span,
    gapText: point.text,
    detail: point.detail,
    tone: point.value === null ? "neutral" : levelToneOf(point.value, line),
  }));
}

/** A level judged against a line (the target, the low-cover mark) draws each row's distance from that line, so 93% and 102% no longer look like two full bars. */
function levelBody(query: MetricQuery, rows: MetricRow[], line: LevelLine): CardBody {
  const shown = rows.slice(0, MAX_RANK_ROWS);
  const withChange = shown.some((row) => deltaPercentOf(row) !== null);
  const points = shown.map((row) => ({ row, value: numericOf(row, "value"), text: valueTextOf(query, row), detail: changeTextOf(query.metric, row) }));
  return {
    kind: "gap",
    rows: gapRowsOf(query, points, line),
    ends: line.ends,
    caption: withChange ? TH.dash.levelChangeCaption(line.caption, TH.dash.compare[query.compare] ?? "") : line.caption,
    shownOf: null,
  };
}

/** R3's body: each row's value over its target around the 100% line, furthest under first, the value itself in grey. */
function targetBody(query: MetricQuery, rows: MetricRow[]): CardBody {
  const byAttainment = [...rows].sort((left, right) => (attainmentOf(left) ?? Infinity) - (attainmentOf(right) ?? Infinity));
  const points = byAttainment.slice(0, MAX_RANK_ROWS).map((row) => {
    const value = attainmentOf(row);
    return { row, value, text: value === null ? "—" : percentText(value), detail: valueTextOf(query, row) };
  });
  return { kind: "gap", rows: gapRowsOf(query, points, TARGET_LINE), ends: TARGET_LINE.ends, caption: TARGET_LINE.caption, shownOf: null };
}

function concreteBars(shape: Shape, bars: Bars): Exclude<Bars, "auto"> {
  if (bars !== "auto") return bars;
  if (asksAboutChange(shape.sortBy) && hasChange(shape.rows)) return "change";
  return LEVEL_LINES[shape.query.metric] ? "level" : "rank";
}

/** The bars the decision table chose; with `auto`, the change when the list is ranked by it, the distance from a deciding line when the metric has one, the level from zero otherwise. */
function barBody(shape: Shape, bars: Bars): CardBody {
  const { query, rows } = shape;
  const kind = concreteBars(shape, bars);
  const line = LEVEL_LINES[query.metric];
  if (kind === "change") return changeBody(query, rows);
  if (kind === "target") return targetBody(query, rows);
  if (kind === "level" && line) return levelBody(query, rows, line);
  return { kind: "rank", rows: rankRowsOf(query, rows), showRank: rows.length > RANK_MIN_ROWS };
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
  const items = alerts.map((alert) => {
    const repeated = said.has(alert.hypothesis);
    said.add(alert.hypothesis);
    return signalOf(alert, repeated ? null : alert.hypothesis);
  });
  return { kind: "alerts", items: items.slice(0, MAX_ALERTS), more: items.slice(MAX_ALERTS) };
}

function bodyFor(shape: Shape, view: CardView, extras: CardExtras, bars: Bars): CardBody {
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
  if (view === "bar" && (rows.length >= RANK_MIN_ROWS || (bars === "level" && rows.length > 0))) return barBody(shape, bars);
  if (view === "metric") return meterBody(query, rows);
  if (rows.length === 0) return { kind: "none" };
  return tableBody(query, rows, false);
}

function hiddenGroupsNote(shape: Shape, view: CardView): string | null {
  if (view !== "line" || shape.additive || groupDimsOf(shape.query).length === 0) return null;
  const count = groupCountOf(shape.query, shape.rows);
  return count > MAX_LINES ? TH.dash.shownOf(MAX_LINES, count) : null;
}

type Pairing = { view: "scatter" | "gap" | "funnel" | "overlay"; sources: Source[] };

function sliceKeyOf(source: Source): string {
  const { query } = source;
  return JSON.stringify([[...query.dims].sort(), query.range.from, query.range.to, query.grain, Object.entries(query.filters ?? {}).sort(([left], [right]) => left.localeCompare(right))]);
}

function holdsOneValue(source: Source): boolean {
  return groupDimsOf(source.query).length === 0 && source.result.rows.length <= 1;
}

/** R10: what a card bound to several metric results of the same dimensions and range draws (a funnel of single values in one unit, lines over the same buckets, a parity gap or a scatter of the same groups), or null when they do not fit together and only the first is shown. */
function pairingOf(first: Source, others: Source[]): Pairing | null {
  const all = [first, ...others.filter((other) => sliceKeyOf(other) === sliceKeyOf(first) && other.query.metric !== first.query.metric)];
  if (all.length < 2) return null;
  if (all.every(holdsOneValue) && sameUnit(all)) return { view: "funnel", sources: all };
  const timeOnly = all.every((source) => timeDimOf(source.query) !== null && groupDimsOf(source.query).length === 0 && source.result.rows.length >= MIN_LINE_BUCKETS);
  if (timeOnly) return { view: "overlay", sources: all };
  const [, second] = all;
  const grouped = groupDimsOf(first.query).length > 0 && !timeDimOf(first.query);
  if (!grouped) return null;
  if (isParityPair(first, second) && joinedRows(first, second).length >= RANK_MIN_ROWS) return { view: "gap", sources: [first, second] };
  if (joinedRows(first, second).length >= MIN_SCATTER_POINTS) return { view: "scatter", sources: [first, second] };
  return null;
}

/** Which of `others` (by index) the card of `first` draws with it under R10; empty when they do not pair, so each keeps its own card. */
export function pairedIndexes(first: PresentSource, others: readonly PresentSource[]): number[] {
  if (!first.result.ok) return [];
  const candidates = others.flatMap((other, index) => (other.result.ok ? [{ index, source: { query: other.query, result: other.result } }] : []));
  const pairing = pairingOf({ query: first.query, result: first.result }, candidates.map((candidate) => candidate.source));
  if (!pairing) return [];
  return pairing.sources.slice(1).flatMap((source) => candidates.filter((candidate) => candidate.source === source).map((candidate) => candidate.index));
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
  const scope = scopeLabelsOf(first.query, first.result);
  const filtered = scope.length > 0 ? TH.dash.filteredTo(scope.join(", ")) : null;
  const dim = rankDimOf(first.query);
  const counted = (pairing.view === "scatter" || pairing.view === "gap") && dim ? `${joinedRows(first, others[0]).length} ${TH.dash.dimUnit[dim]}` : null;
  return TH.dash.scope(period, joined([filtered, counted]));
}

function shortMetricLabel(source: Source): string {
  return metricLabel(source.query.metric).replace(PARENTHETICAL, "");
}

/** A paired card's title names every metric it draws: the stages of a funnel in order, otherwise one against the other, and the groups they are compared by. */
function pairedTitleOf(pairing: Pairing): string {
  const labels = pairing.sources.map(shortMetricLabel);
  if (pairing.view === "funnel") return TH.dash.stages(labels);
  const dim = rankDimOf(pairing.sources[0].query);
  const versus = TH.dash.versusMetrics(labels);
  return dim ? TH.dash.ownScope(versus, TH.dash.byDims([TH.dash.dimUnit[dim]])) : versus;
}

function rowTotalOf(source: Source): number {
  return source.result.rows.reduce((sum, row) => sum + (numericOf(row, "value") ?? 0), 0);
}

/** Two summed metrics in one unit read as one against the other: the last as a share of the first over everything the card draws (sell-out as a share of sell-in, sold out as a share of produced), the two totals beside it. */
function ratioHero(base: Source, other: Source): CardHero | null {
  const additive = base.result.headline.aggregate === "sum" && other.result.headline.aggregate === "sum";
  const total = rowTotalOf(base);
  if (!additive || !sameUnit([base, other]) || total === 0) return null;
  const share = (rowTotalOf(other) / total) * PERCENT;
  const move = moveOf(other.query, share - PERCENT, null);
  return {
    label: TH.dash.gapHeroLabel(shortMetricLabel(other), shortMetricLabel(base)),
    value: percentText(share),
    delta: null,
    trend: move.trend,
    tone: move.tone,
    detail: TH.dash.stages([base.result.headline.value, other.result.headline.value]),
    note: null,
  };
}

function pairedHero(pairing: Pairing, indexed: boolean): CardHero | null {
  const [first, ...others] = pairing.sources;
  const last = others[others.length - 1];
  if (pairing.view === "gap") {
    const dim = rankDimOf(first.query);
    return gapHero(first, others[0], dim ? TH.dash.dimUnit[dim] : null);
  }
  if (pairing.view === "funnel") return ratioHero(first, last);
  if (pairing.view !== "overlay" || indexed) return null;
  return (others.length === 1 ? ratioHero(first, last) : null) ?? heroOf(first.query, first.result, first.result.rows);
}

function pairedCard(input: PresentInput, pairing: Pairing): CardParts {
  const [first, ...others] = pairing.sources;
  const indexed = pairing.view === "overlay" && isIndexedOverlay(first, others);
  return {
    title: pairedTitleOf(pairing),
    meta: pairedMeta(pairing),
    description: input.description ?? null,
    footnote: footnoteOf(first.result, indexed ? TH.dash.indexedNote : null, 0),
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
    meta: TH.dash.alertCount(input.alerts.length),
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
    worst = { label: labelOf(query, row), delta: changeTextOf(query.metric, row) ?? "", deltaPercent: delta };
  }
  return worst;
}

function isHiddenRow(row: MetricRow): boolean {
  return row.value === MASKED;
}

function everyValueMasked(result: Extract<MetricResult, { ok: true }>): boolean {
  return result.provenance.masked.includes("value") && result.rows.length > 0 && result.rows.every((row) => row.value === MASKED || row.value === null);
}

function maskedCard(input: PresentInput, result: Extract<MetricResult, { ok: true }>): CardParts {
  const dim = rankDimOf(input.query);
  const names = dim && result.rows.length > 1 ? result.rows.slice(0, MAX_RANK_ROWS).map((row) => ({ label: labelOf(input.query, row) })) : [];
  return {
    title: input.title,
    meta: null,
    description: null,
    footnote: null,
    hero: null,
    body: dim && names.length > 0 ? { kind: "locked", rows: [], locked: names, askHref: null } : { kind: "none" },
    actions: input.actions ?? NO_ACTIONS,
    denied: { title: TH.dash.denied, body: TH.dash.maskedAll(dim && names.length > 0 ? TH.dash.dimUnit[dim] : null) },
  };
}

export type ForecastPoint = { week: string; date: string; value: number; lo: number; hi: number; value_label: string };
export type ForecastAnswer = { metric: MetricId; total: number | null; mape: number | null; weeks: ForecastPoint[] };

export type PresentForecastInput = {
  title: string;
  forecast: ForecastAnswer;
  history: PresentSource | null;
  description?: string | null;
};

function historyPoints(history: PresentSource | null): { label: string; value: number }[] {
  if (!history || !history.result.ok || !timeDimOf(history.query) || rankDimOf(history.query)) return [];
  const trimmed = withoutPartialBucket(history.query, "line", history.result.rows, history.result.provenance.asOf);
  return chartPoints(history.query, trimmed.rows).slice(-MAX_HISTORY_POINTS);
}

function forecastHero(forecast: ForecastAnswer): CardHero {
  const points = forecast.weeks;
  const last = points[points.length - 1];
  const detail = forecast.mape === null ? null : TH.dash.forecastError(formatPercent(forecast.mape));
  if (forecast.total !== null) {
    return { label: TH.dash.forecastTotal(points.length), value: formatMetricValue(forecast.metric, forecast.total), delta: null, trend: "neutral", tone: "neutral", detail, note: null };
  }
  return { label: TH.dash.forecastLast(last.week), value: last.value_label, delta: null, trend: "neutral", tone: "neutral", detail, note: null };
}

function afterHistory(values: number[], history: { value: number }[]): (number | null)[] {
  if (history.length === 0) return values;
  return [...history.slice(0, -1).map(() => null), history[history.length - 1].value, ...values];
}

function forecastBody(forecast: ForecastAnswer, history: { label: string; value: number }[]): CardBody {
  return {
    kind: "forecast",
    labels: [...history.map((point) => point.label), ...forecast.weeks.map((point) => point.week)],
    actual: [...history.map((point) => point.value), ...forecast.weeks.map(() => null)],
    forecast: afterHistory(forecast.weeks.map((point) => point.value), history),
    lo: afterHistory(forecast.weeks.map((point) => point.lo), history),
    hi: afterHistory(forecast.weeks.map((point) => point.hi), history),
    format: metricFormat(forecast.metric),
  };
}

/** A get_forecast answer as a card: the weekly forecast with its band after the actual weeks, the total or last week as the headline, and the back-tested error as a plain caption rather than a change. */
export function presentForecast(input: PresentForecastInput): CardParts {
  const { forecast } = input;
  const points = forecast.weeks;
  if (points.length === 0) {
    return { title: input.title, meta: null, description: input.description ?? null, footnote: null, hero: null, body: { kind: "none" }, actions: NO_ACTIONS, denied: null };
  }
  return {
    title: input.title,
    meta: TH.dash.forecastScope(points[0].week, points[points.length - 1].week, points.length),
    description: input.description ?? null,
    footnote: TH.dash.forecastMethod,
    hero: forecastHero(forecast),
    body: forecastBody(forecast, historyPoints(input.history)),
    actions: NO_ACTIONS,
    denied: null,
  };
}

function locksBreakdown(query: MetricQuery, locked: LockedRows): boolean {
  const groups = groupDimsOf(query);
  return locked.labels.length > 0 && !timeDimOf(query) && groups.length === 1 && groups[0] === locked.dim;
}

/** A shared card that holds rows back: the viewer's own rows in their usual order, then one locked row per hidden name in the order given; the headline is the viewer's own figure, labelled with the rows it covers, so nothing about the hidden rows can be worked out from it. */
function lockedCard(input: PresentInput, result: Extract<MetricResult, { ok: true }>, rows: MetricRow[], locked: LockedRows): CardParts {
  const { query } = input;
  const visible = rankRowsOf(query, rows);
  const own = heroOf(query, result, rows);
  return {
    title: input.title,
    meta: scopeOf(query, rows.length, visible.length, result.headline.periodLabel, result.provenance.filterLabels ?? [], 0),
    description: input.description ?? null,
    footnote: footnoteOf(result, null, 0),
    hero: { ...own, label: TH.dash.ownScope(metricLabel(query.metric), visible.map((row) => row.label).join(", ")) },
    body: { kind: "locked", rows: visible, locked: locked.labels.map((label) => ({ label })), askHref: locked.askHref },
    actions: input.actions ?? NO_ACTIONS,
    denied: null,
  };
}

/** How many groups the scope line counts: the rows a `where` kept (they are what the card shows), every group in scope when a level line counted them, else the rows the result holds. */
function shownCountOf(query: MetricQuery, result: OkResult, visibleRows: MetricRow[], hidden: number): number {
  if (query.where) return groupCountFor(query, visibleRows, visibleRows.length);
  if (groupDimsOf(query).length === 1 && result.headline.underLine) return result.headline.underLine.of;
  return groupCountFor(query, visibleRows, result.headline.rowCount - hidden);
}

/**
 * Every data card in Winyu, drawn from the decision table (`CARD_RULES`): what the headline answers, which body the data shape deserves,
 * what the scope and source lines say. The dashboard and the chat both draw it.
 */
export function presentCard(input: PresentInput): CardParts {
  const { query, result, title } = input;
  if (!result.ok) {
    return { title, meta: null, description: null, footnote: null, hero: null, body: { kind: "none" }, actions: [], denied: refusalNoticeOf(result.code, result.error) };
  }
  if (everyValueMasked(result)) return maskedCard(input, result);
  const extras = input.extras ?? NO_EXTRAS;
  const hidden = result.rows.filter(isHiddenRow).length;
  const visibleRows = hidden > 0 ? result.rows.filter((row) => !isHiddenRow(row)) : result.rows;
  const masked = result.provenance.masked.length > 0 && hidden === 0;
  const sortBy = input.sortBy ?? query.sort ?? null;
  if (input.locked && !masked && hidden === 0 && locksBreakdown(query, input.locked)) return lockedCard(input, result, sorted(query, visibleRows, sortBy), input.locked);
  const pairing = masked || hidden > 0 ? null : pairingOf({ query, result }, okSources(input.others));
  if (pairing) return pairedCard(input, pairing);
  const whole: Shape = { query, rows: visibleRows, additive: result.headline.aggregate === "sum", sortBy };
  const facts = factsOf(whole, result);
  const fit = fitOf(facts);
  const view = hidden > 0 && visibleRows.length < RANK_MIN_ROWS ? "table" : viewFor(whole, input.view ?? "auto", masked, extras, fit);
  const trimmed = withoutPartialBucket(query, view, visibleRows, result.provenance.asOf);
  const shape: Shape = { ...whole, rows: sorted(query, trimmed.rows, sortBy) };
  const note = [trimmed.note, hiddenGroupsNote(shape, view)].filter((line): line is string => line !== null).join(" · ");
  const body = bodyFor(shape, view, extras, fit.bars);
  return {
    title,
    meta: scopeOf(query, shownCountOf(query, result, visibleRows, hidden), drawnRowsOf(query, body), result.headline.periodLabel, result.provenance.filterLabels ?? [], hidden),
    description: input.description ?? null,
    footnote: footnoteOf(result, note || null, hidden),
    hero: masked || hidden > 0 || view === "alert_list" ? null : HEROES[fit.hero]({ ...facts, rows: shape.rows }),
    body,
    actions: input.actions ?? NO_ACTIONS,
    denied: null,
  };
}
