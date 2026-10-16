import { WIDGET_KINDS, type Alert, type AlertRow, type Dim, type Forecast, type MetricId, type MetricQuery, type MetricResult, type MetricRow, type MonthEndProjection, type NextAction, type UnderLine, type WidgetKind } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { MIN_CELL_SIZE } from "@/lib/access/suppression";
import { addDays, daysBetween, monthKeyOfIso, weekKeyOfIso } from "@/lib/data/dates";
import { formatDateTh, formatPercent, periodLabelTh } from "@/lib/i18n/format";
import { changeTextOf, deltaPercentOf, deltaPointsOf, groupDimsOf, labelAlong, labelOf, numericOf, timeDimOf, valueTextOf } from "./rows";
import { changeOf, exceptionsOf, fitsOneStrip, LEVEL_LINES, parityReading, percentIn, readBreakdown, stripOf, type Breakdown, type BreakdownBars, type LevelLine } from "./breakdown";
import { compactPeriod, outliersOf, percentText, rangeText, shareVerdict, spaced, summaryVerdict, trendVerdict, type CardFooter, type Fold, type ReadRow, type Strip, type Tile } from "./reading";
import {
  bucketCountOf,
  funnelBody,
  parityGaps,
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
  directionOf,
  formatChange,
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

/** The one number a card leads with: its label, the value with what it is of ("ของเป้า"), one coloured change, and what that change is against. */
export type CardHero = { label: string; value: string; unit: string | null; delta: string | null; trend: Direction; tone: Tone; detail: string | null };
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
export type HeatCell = { text: string; detail: string | null; intensity: number; tone: Tone; exception: boolean };
export type ShareSlice = { label: string; valueText: string; share: number; shareText: string; isOther: boolean };
export type ScatterPoint = { label: string; x: number; y: number; xText: string; yText: string; named: boolean };
export type ScatterAxis = { label: string; format: MetricFormat; median: number; medianText: string };
export type FunnelStage = { label: string; value: number; valueText: string; width: number; dropText: string | null; dropTone: Tone };
/** A row a shared card holds back from its viewer: its name only, never a value, a change, a share or a rank. */
export type LockedRow = { label: string };

/** The rows a shared card holds back along its one breakdown: names in the dimension's fixed order, and where asking for them goes (null when nobody may be asked now). */
export type LockedRows = { dim: Dim; labels: string[]; askHref: string | null };

export type CardBody =
  | { kind: "none" }
  | { kind: "strip"; strip: Strip }
  | { kind: "exceptions"; strip: Strip; fold: Fold | null }
  | { kind: "locked"; rows: RankRow[]; locked: LockedRow[]; askHref: string | null }
  | { kind: "line"; labels: string[]; series: ChartSeries[]; format: MetricFormat }
  | { kind: "stacked"; shape: "bar" | "area"; labels: string[]; series: ChartSeries[]; format: MetricFormat }
  | { kind: "share"; slices: ShareSlice[]; centerValue: string; centerLabel: string }
  | { kind: "heatmap"; rowLabels: string[]; columnLabels: string[]; cells: (HeatCell | null)[][]; scale: ColorScale }
  | { kind: "scatter"; points: ScatterPoint[]; x: ScatterAxis; y: ScatterAxis; r: number }
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

/** How a card is laid out: B picture first (a breakdown of up to 8 rows), A verdict and exceptions (a longer breakdown), C scorecard (one scope, two or three facts), or any other chart with the same anatomy. */
export type CardStyle = "picture" | "exceptions" | "scorecard" | "chart";

/** One data card as both surfaces draw it: verdict, hero with one coloured change, body by style (style C's other facts as tiles), one primary next step with the rest behind a menu, one footer line. */
export type CardParts = {
  title: string;
  style: CardStyle;
  verdict: string | null;
  hero: CardHero | null;
  tiles: Tile[];
  body: CardBody;
  primary: NextAction | null;
  more: NextAction[];
  footer: CardFooter | null;
  denied: RefusalNotice | null;
};

export type CardExtras = { alerts?: AlertRow[]; forecast?: Forecast | null; overlay?: { name: string; result: MetricResult } | null };

export type PresentInput = {
  title: string;
  query: MetricQuery;
  result: MetricResult;
  view?: CardView;
  sortBy?: SortBy | null;
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
const MONDAY = 1;
const DAYS_PER_WEEK = 7;
const MONTH_FIRST = "-01";
const PERCENT = 100;
const NO_EXTRAS: CardExtras = {};
const NO_ACTIONS: NextAction[] = [];
const NO_TILES: Tile[] = [];
const MAX_LINES = 5;
const MAX_BAR_BUCKETS = 12;
const MAX_SHARE_ROWS = 6;
const MIN_PLOTTED_SCATTER = 7;
const MIN_GRID_FILL = 0.6;
const COMPOSITION_DIMS: ReadonlySet<Dim> = new Set(["channel", "business_unit", "maker", "pack"]);
const SHARE_METRICS: ReadonlySet<MetricId> = new Set(["market_share", "share_of_voice"]);
const SEVERITY_TONES: Record<Alert["severity"], AlertTone> = { P1: "danger", P2: "warning", P3: "info" };
const VERDICT_UNITS: Partial<Record<Dim, string>> = { dc: "DC" };
const STRONG_CORRELATION = 0.5;
const RECENT_WEEKS = 4;
const MIN_GRID_GAP_PERCENT = 5;

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
  delta_asc: (query) => (left, right) => (changeOf(query, left) ?? 0) - (changeOf(query, right) ?? 0),
  delta_desc: (query) => (left, right) => (changeOf(query, right) ?? 0) - (changeOf(query, left) ?? 0),
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

/** Whether two breakdowns fill enough of their grid to read as a heatmap; a top-N of DC × SKU leaves it mostly empty and reads better as bars. */
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
  return groupCountOf(shape.query, shape.rows) <= MAX_LINES && bucketCountOf(shape.query, shape.rows) >= MIN_LINE_BUCKETS ? "line" : "heatmap";
}

type OkResult = Extract<MetricResult, { ok: true }>;

/** What the card leads with when it is not a breakdown drawn as bars: the total, the one row it has, the row that ranks first, the latest full bucket, or the overall row of the breakdown reading. */
type HeroKind = "total" | "single" | "leader" | "latest" | "reading";

/** Which bars a breakdown draws; `auto` picks the change when the list is ranked by it, the deciding line when the metric has one, a leaderboard for a sum, a reference level for a rate. */
type Bars = "auto" | BreakdownBars;

/** Which family of styles a rule's card belongs to: a breakdown (B, or A above 8 rows), a summary of one scope (C), or another chart with the same anatomy. */
type Look = "breakdown" | "summary" | "chart";

/** Everything the decision table reads: the query's intent (compare, sort, limit, where, dims, grain), the rows it got, and the metric's level line. */
type Facts = Shape & { result: OkResult; groups: number; time: boolean; buckets: number; line: LevelLine | null; under: UnderLine | null; capped: boolean; filtered: boolean };

/** One row of the decision table: when it applies, the form it draws, the bars and the hero that answer, and the style family. */
type CardRule = { rule: string; when: (facts: Facts) => boolean; view: (facts: Facts) => CardView; bars: Bars; hero: HeroKind; look: Look };

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

/** The one decision table: the first rule whose condition holds decides the form, the hero, the bars and the style family (breakdowns B or A above 8 rows, one scope C, any other chart). */
const CARD_RULES: readonly CardRule[] = [
  { rule: "R7 threshold met by few", when: (f) => Boolean(f.query.where) && f.under !== null && f.groups === 1 && !f.time && f.rows.length > 0, view: always("bar"), bars: "level", hero: "reading", look: "breakdown" },
  { rule: "R1 one row", when: (f) => f.rows.length <= 1 && (f.query.dims.length > 0 || f.filtered), view: always("metric"), bars: "auto", hero: "single", look: "summary" },
  { rule: "R2 short series", when: (f) => f.time && f.groups === 0 && f.buckets < MIN_LINE_BUCKETS, view: always("metric"), bars: "auto", hero: "total", look: "summary" },
  { rule: "R9 trend", when: (f) => f.time && f.groups === 0, view: always("line"), bars: "auto", hero: "latest", look: "summary" },
  { rule: "time × group", when: (f) => f.time, view: timeView, bars: "auto", hero: "total", look: "chart" },
  { rule: "R4 two groups sorted by change", when: (f) => f.groups >= 2 && !isDenseGrid(f) && asksAboutChange(f.sortBy) && hasChange(f.rows), view: always("bar"), bars: "change", hero: "reading", look: "breakdown" },
  { rule: "two groups", when: (f) => f.groups >= 2, view: (f) => (isDenseGrid(f) ? "heatmap" : "bar"), bars: "auto", hero: "total", look: "breakdown" },
  { rule: "no breakdown", when: (f) => f.groups === 0 || f.rows.length < RANK_MIN_ROWS, view: (f) => (f.rows.length <= 1 ? "metric" : "table"), bars: "auto", hero: "total", look: "summary" },
  { rule: "R6 under the line", when: (f) => f.line !== null && f.under !== null && f.under.count > 0, view: always("bar"), bars: "level", hero: "reading", look: "breakdown" },
  { rule: "R6 nothing under the line", when: (f) => f.line !== null && f.under !== null, view: always("bar"), bars: "level", hero: "reading", look: "breakdown" },
  { rule: "R4 sorted by change", when: (f) => asksAboutChange(f.sortBy) && hasChange(f.rows), view: always("bar"), bars: "change", hero: "reading", look: "breakdown" },
  { rule: "R3 against target", when: (f) => f.query.compare === "target" && hasChange(f.rows), view: always("bar"), bars: "target", hero: "reading", look: "breakdown" },
  { rule: "R5 top of a ranking", when: (f) => sortsByValue(f.sortBy) && (!f.additive || f.capped), view: wholeOrBars, bars: "auto", hero: "leader", look: "breakdown" },
  { rule: "breakdown", when: () => true, view: wholeOrBars, bars: "auto", hero: "reading", look: "breakdown" },
];

type Fit = { rule: string; view: CardView; bars: Bars; hero: HeroKind; look: Look };

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
  return { rule: rule.rule, view: rule.view(facts), bars: rule.bars, hero: rule.hero, look: rule.look };
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

function isCapped(query: MetricQuery, rowCount: number): boolean {
  return query.limit !== null && rowCount >= query.limit;
}

function hiddenLineOf(query: MetricQuery, hidden: number): string | null {
  if (hidden === 0) return null;
  const dim = rankDimOf(query);
  return TH.dash.hiddenSmall(hidden, dim ? TH.dash.dimUnit[dim] : TH.dash.item, MIN_CELL_SIZE);
}

/** What the person narrowed the question to (an agent, a brand), without the value threshold a `where` adds to the same list. */
function scopeLabelsOf(query: MetricQuery, result: OkResult): readonly string[] {
  const labels = result.provenance.filterLabels ?? [];
  return query.where ? labels.slice(0, -1) : labels;
}

/** What a card's headline number is about in full, metric and scope ("มูลค่าขายเข้า รวมทุกภาค"), for places that show it without the card's title. */
export function subjectOf(query: MetricQuery, result: MetricResult): string {
  return result.ok ? heroLabelOf(query, result) : metricLabel(query.metric);
}

/** A breakdown's headline stands for every group in scope, not only the rows the card lists; the label says which, and a total over everything the person may see says so. */
function heroLabelOf(query: MetricQuery, result: OkResult): string {
  const label = metricLabel(query.metric);
  const dim = rankDimOf(query);
  if (!dim && !timeDimOf(query) && scopeLabelsOf(query, result).length === 0) return TH.dash.wholeScope(label, result.headline.aggregate === "average");
  if (!dim || timeDimOf(query) || result.rows.length <= 1) return label;
  const unit = TH.dash.dimUnit[dim];
  return result.headline.aggregate === "average" ? TH.dash.averageAcross(label, unit) : TH.dash.totalAcross(label, unit);
}

/** What the overall row of a breakdown is called: the whole country for regions nobody narrowed, else every group of the unit, summed or averaged. */
function overallLabelOf(query: MetricQuery, result: OkResult): string {
  const dim = rankDimOf(query);
  const unit = verdictUnitOf(query);
  const narrowed = scopeLabelsOf(query, result).length > 0 || Object.keys(result.query.scopeApplied ?? {}).length > 0;
  if (dim === "region" && !narrowed) return TH.read.nationwide;
  return result.headline.aggregate === "average" ? TH.read.averageOf(unit) : TH.read.allOf(unit);
}

/** The unit word a verdict counts groups in ("ภาค", "SKU", "DC"). */
function verdictUnitOf(query: MetricQuery): string {
  const dim = rankDimOf(query);
  if (!dim || groupDimsOf(query).length !== 1) return TH.dash.item;
  return VERDICT_UNITS[dim] ?? TH.dash.dimUnit[dim];
}

function lastDayOfMonth(iso: string): string {
  return addDays(`${addDays(`${monthKeyOfIso(iso)}-28`, 4).slice(0, 7)}-01`, -1);
}

function targetThrough(query: MetricQuery, asOf: string): string {
  return query.range.to < asOf ? query.range.to : asOf;
}

/** Whether a target figure is counted only to a day inside its month: 100% then means on pace to date, never the whole month's target, and the card says "ตามเวลา". */
function isPacedTarget(query: MetricQuery, asOf: string): boolean {
  if (query.metric !== "target_attainment" && query.compare !== "target") return false;
  const through = targetThrough(query, asOf);
  return through !== lastDayOfMonth(through);
}

function targetUnitOf(query: MetricQuery, asOf: string): string {
  return isPacedTarget(query, asOf) ? TH.read.ofPacedTarget : TH.read.ofTarget;
}

/** Against a target in a month still running, 100% means on pace to date: the line names the day the target is counted to and how much of the whole month that is. */
function paceNoteOf(query: MetricQuery, asOf: string): string | null {
  if (!isPacedTarget(query, asOf)) return null;
  const through = targetThrough(query, asOf);
  const monthEnd = lastDayOfMonth(through);
  if (query.range.from > `${monthKeyOfIso(through)}-01`) return null;
  const share = (Number(through.slice(8)) / Number(monthEnd.slice(8))) * PERCENT;
  return TH.dash.paceTarget(formatDateTh(through), formatPercent(Math.round(share)));
}

function joined(parts: readonly (string | null)[]): string | null {
  return parts.filter((part): part is string => part !== null && part !== "").join(" · ") || null;
}

function projectionNote(result: OkResult): string | null {
  return result.headline.projection ? TH.dash.monthEnd(result.headline.projection) : null;
}

/** The footer every data card closes with: the date span, what the question was narrowed to and the source in one line; trust, as-of, coverage, masking and the notes behind it. */
function footerOf(query: MetricQuery, result: OkResult, notes: readonly (string | null)[]): CardFooter {
  const provenance = result.provenance;
  const masked = provenance.masked.length > 0 ? TH.dash.maskedNote(provenance.masked.length) : null;
  return {
    line: [compactPeriod(result.headline.periodLabel), ...scopeLabelsOf(query, result), provenance.sourceSystem].join(" · "),
    verified: provenance.trust === "verified",
    details: joined([TH.dash.trust[provenance.trust], TH.read.asOf(formatDateTh(provenance.asOf)), result.headline.compareLabel, provenance.coverage?.label ?? null, masked, result.headline.compareNote, ...notes]),
  };
}

type Move = { delta: string | null; trend: Direction; tone: Tone };

function againstTarget(deltaPercent: number | null): Pick<Move, "trend" | "tone"> {
  if (deltaPercent === null || deltaPercent === 0) return { trend: "neutral", tone: deltaPercent === 0 ? "good" : "neutral" };
  return deltaPercent < 0 ? { trend: "down", tone: "bad" } : { trend: "up", tone: "good" };
}

/** A change as a card writes it: in points for a percent metric, and judged against the 100% line when the comparison is a target, so 1.4% under target never reads grey. */
function moveOf(query: MetricQuery, deltaPercent: number | null, deltaPoints: number | null): Move {
  const delta = formatChange(query.metric, deltaPercent, deltaPoints);
  if (delta === null) return { delta, trend: "neutral", tone: "neutral" };
  if (query.compare === "target") return { delta, ...againstTarget(deltaPercent) };
  return { delta, trend: changeDirectionOf(query.metric, deltaPercent, deltaPoints), tone: changeToneOf(query.metric, deltaPercent, deltaPoints) };
}

function rowMoveOf(query: MetricQuery, row: MetricRow): Move {
  return moveOf(query, deltaPercentOf(row), deltaPointsOf(row));
}

function headlineMoveOf(query: MetricQuery, result: OkResult): Move {
  return moveOf(query, result.headline.deltaPercent, result.headline.deltaPoints ?? null);
}

function heroOf(query: MetricQuery, result: OkResult): CardHero {
  return { label: heroLabelOf(query, result), value: result.headline.value, unit: null, ...headlineMoveOf(query, result), detail: result.headline.compareLabel };
}

/** Days of one week or one month ("ยอดอาทิตย์นี้", "เดือนนี้รายวัน") ask about that period: its total against its comparison leads, the days are only the picture; a longer trend reads its latest bucket instead. */
function asksAboutOnePeriod(query: MetricQuery): boolean {
  if (query.grain !== "day") return false;
  return weekKeyOfIso(query.range.from) === weekKeyOfIso(query.range.to) || monthKeyOfIso(query.range.from) === monthKeyOfIso(query.range.to);
}

type LatestBucket = { label: string; previous: string; value: string; deltaPercent: number; deltaPoints: number; versus: string };

/** A series with no breakdown is read at its latest full bucket against the one before: a sum always (the range total moves to a tile), a rate when nothing else is compared; the total or average of the whole line hides the turn someone asked about. */
function latestBucketOf(query: MetricQuery, result: OkResult, rows: MetricRow[]): LatestBucket | null {
  if (result.headline.aggregate === "average" && result.headline.deltaPercent !== null) return null;
  if (asksAboutOnePeriod(query)) return null;
  if (rows.length === 2 && leadingPartialDays(query) !== null) return null;
  if (!timeDimOf(query) || groupDimsOf(query).length > 0 || rows.length < 2) return null;
  const [previous, latest] = rows.slice(-2);
  const previousValue = numericOf(previous, "value");
  const latestValue = numericOf(latest, "value");
  if (previousValue === null || latestValue === null || previousValue === 0) return null;
  return {
    label: labelOf(query, latest),
    previous: labelOf(query, previous),
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

/** A card's hero, its other facts as tiles (style C when there is at least one) and its verdict. */
type Lead = { hero: CardHero; tiles: Tile[]; verdict: string };

function shortMetric(metric: MetricId): string {
  return metricLabel(metric).replace(PARENTHETICAL, "");
}

function isFlat(move: Move): boolean {
  return move.trend === "neutral";
}

function tileOf(label: string, value: string, sub: string | null): Tile {
  return { label, value, delta: null, tone: "neutral", sub };
}

function paceVerdict(label: string, paced: number): string {
  return paced >= PERCENT ? TH.read.onPace(label) : TH.read.behindPace(label, percentText(PERCENT - paced));
}

/** A month still running against its target has one base, the whole month's target: the hero is the share of it done so far, then what is left to it, the share of the target spread over the days so far (named "ตามเวลา"), and where the month ends at the recent pace; nothing left is ever set beside the forecast. */
function monthToDateLead(name: string, paced: number, actual: string, projection: MonthEndProjection): Lead {
  const behind = paced < PERCENT;
  const left = projection.shortBy ? tileOf(TH.read.toTarget, projection.shortBy, TH.read.ofMonthTarget) : null;
  return {
    hero: { label: name, value: projection.attainmentToDate, unit: TH.read.ofMonthTarget, delta: null, trend: behind ? "down" : "neutral", tone: behind ? "bad" : "neutral", detail: `${TH.read.actual} ${actual}` },
    tiles: [left, tileOf(TH.read.pacedTarget, percentText(paced), null), tileOf(TH.read.monthEnd, projection.attainment, TH.read.ofMonthTarget)].filter((tile): tile is Tile => tile !== null),
    verdict: paceVerdict(name, paced),
  };
}

/** One number about one scope (R1, R2, a total): its share of target when there is one, else its change with the value it is compared with, plus where the month ends. */
function summaryLead(facts: Facts, name: string, subject: string): Lead {
  const { query, result, rows } = facts;
  const [row] = rows;
  const overTarget = query.compare === "target" && query.metric !== "target_attainment";
  const attainment = overTarget ? (result.headline.deltaPercent === null ? null : PERCENT + result.headline.deltaPercent) : query.metric === "target_attainment" ? (row && rows.length === 1 ? numericOf(row, "value") : percentIn(result.headline.value)) : null;
  const projection = result.headline.projection ? tileOf(TH.read.monthEnd, result.headline.projection.attainment, TH.read.ofMonthTarget) : null;
  if (attainment !== null) {
    const tone: Tone = attainment < PERCENT ? "bad" : "neutral";
    const trend = attainment < PERCENT ? "down" : "neutral";
    if (result.headline.projection && overTarget) return monthToDateLead(name, attainment, result.headline.value, result.headline.projection);
    const paced = isPacedTarget(query, result.provenance.asOf);
    const actual = overTarget ? tileOf(TH.read.actual, result.headline.value, null) : null;
    return {
      hero: { label: name, value: percentText(attainment), unit: paced ? TH.read.ofPacedTarget : TH.read.ofTarget, delta: null, trend, tone, detail: null },
      tiles: [actual, projection].filter((tile): tile is Tile => tile !== null),
      verdict: paced ? paceVerdict(name, attainment) : summaryVerdict({ label: name, attainment, change: null, changeText: null, flat: false, versus: "", value: result.headline.value }),
    };
  }
  const move = headlineMoveOf(query, result);
  const change = metricFormat(query.metric) === "percent" ? (result.headline.deltaPoints ?? null) : result.headline.deltaPercent;
  const previousValue = row && rows.length === 1 ? numericOf(row, "compare_value") : null;
  const previous = previousValue === null ? null : tileOf(TH.read.previous, formatMetricValue(query.metric, previousValue), null);
  return {
    hero: { label: previous ? TH.read.current : subject, value: result.headline.value, unit: null, ...move, detail: result.headline.compareLabel },
    tiles: [previous, projection].filter((tile): tile is Tile => tile !== null),
    verdict: summaryVerdict({ label: name, attainment: null, change, changeText: move.delta, flat: isFlat(move), versus: result.headline.compareLabel ?? "", value: result.headline.value }),
  };
}

/** R1: one row, named. A breakdown or filter that left one row labels the hero with that row, so "3.9 ล้านลิตร" says which region it is. */
function singleLead(facts: Facts): Lead {
  const { query, result, rows } = facts;
  const row = rows[0];
  const name = (row ? labelAlong(query.dims, row) : null) ?? scopeLabelsOf(query, result).join(", ");
  return summaryLead(facts, name || shortMetric(query.metric), name || heroLabelOf(query, result));
}

/** R9: a series leads with its latest full bucket against the one before; the range total is its second fact. */
function latestLead(facts: Facts): Lead {
  const { query, result, rows } = facts;
  const latest = latestBucketOf(query, result, rows);
  if (!latest) return summaryLead(facts, shortMetric(query.metric), heroLabelOf(query, result));
  const move = moveOf({ ...query, compare: "prev_period" }, latest.deltaPercent, latest.deltaPoints);
  const range = headlineMoveOf(query, result);
  const whole = result.headline.aggregate === "sum" ? [{ label: TH.read.wholeRange, value: result.headline.value, delta: range.delta, tone: range.tone, sub: result.headline.compareLabel }] : NO_TILES;
  const change = metricFormat(query.metric) === "percent" ? latest.deltaPoints : latest.deltaPercent;
  return {
    hero: { label: latest.label, value: latest.value, unit: null, ...move, detail: latest.versus },
    tiles: whole,
    verdict: trendVerdict(latest.label, latest.previous, change, move.delta ?? "", isFlat(move)),
  };
}

/** R5 drawn as a donut: the first row of the ranking. */
function leaderHero(facts: Facts): CardHero {
  const { query, result, rows, sortBy } = facts;
  const first = rows[0];
  if (!first) return heroOf(query, result);
  return { label: TH.dash.rowHero(sortBy === "value_asc" ? TH.dash.lowest : TH.dash.highest, labelOf(query, first)), value: valueTextOf(query, first), unit: null, ...rowMoveOf(query, first), detail: result.headline.compareLabel };
}

function falling(facts: Facts, rows: MetricRow[]): boolean {
  if (facts.sortBy === "delta_asc") return true;
  if (facts.sortBy === "delta_desc") return false;
  const first = rows.map((row) => changeOf(facts.query, row)).find((change) => change !== null);
  return (first ?? 0) < 0;
}

function concreteBars(facts: Facts, bars: Bars): BreakdownBars {
  if (bars !== "auto") return bars;
  if (asksAboutChange(facts.sortBy) && hasChange(facts.rows)) return "change";
  if (LEVEL_LINES[facts.query.metric]) return "level";
  return facts.additive ? "board" : "reference";
}

/** A leaderboard with no order asked reads from the biggest down. */
function boardOrder(facts: Facts, bars: BreakdownBars, rows: MetricRow[]): MetricRow[] {
  return (bars === "board" || bars === "reference") && !facts.sortBy ? sorted(facts.query, rows, "value_desc") : rows;
}

function readingOf(facts: Facts, bars: Bars, rows: MetricRow[]): Breakdown {
  const concrete = concreteBars(facts, bars);
  return readBreakdown({
    query: facts.query,
    result: facts.result,
    rows: boardOrder(facts, concrete, rows),
    bars: concrete,
    unit: verdictUnitOf(facts.query),
    scope: overallLabelOf(facts.query, facts.result),
    threshold: Boolean(facts.query.where) && concrete === "level",
    additive: facts.additive,
    falling: falling(facts, rows),
    target: targetBaseOf(facts),
    baseTotal: baseTotalOf(facts),
    high: (facts.sortBy === "value_desc" && facts.capped) || facts.query.where?.op === "above",
  });
}

/** What the whole of a summed breakdown was in the window it is compared with ("ปีก่อน 10.4 ล้านบาท"), when every group is on the card; a capped or filtered list cannot add up to it. */
function baseTotalOf(facts: Facts): string | null {
  const word = TH.read.base[facts.query.compare];
  if (!word || !facts.additive || facts.capped || facts.query.where) return null;
  const previous = facts.rows.map((row) => numericOf(row, "compare_value"));
  if (previous.length === 0 || previous.some((value) => value === null)) return null;
  return `${word} ${formatMetricValue(facts.query.metric, previous.reduce<number>((sum, value) => sum + (value ?? 0), 0))}`;
}

/** What a breakdown's target figures are a share of, and the whole month's figure beside the overall row when the month is still running. */
function targetBaseOf(facts: Facts): { unit: string; detail: string | null } {
  const projection = facts.result.headline.projection;
  const detail = projection ? TH.read.wholeMonth(projection.attainmentToDate, projection.shortBy) : null;
  return { unit: targetUnitOf(facts.query, facts.result.provenance.asOf), detail };
}

/** Rows a shared card still shows beside the ones it locks, ranked by value with a bar sized against the largest. */
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

/** How many days the first bucket of a range holds when the range starts inside a week or a month (a month-to-date range read by week starts on a Sunday that is one day of its week), or null when the first bucket is whole. */
function leadingPartialDays(query: MetricQuery): number | null {
  const from = query.range.from;
  if (query.grain === "week") {
    const weekday = (new Date(`${from}T00:00:00Z`).getUTCDay() + DAYS_PER_WEEK - MONDAY) % DAYS_PER_WEEK;
    return weekday === 0 ? null : Math.min(DAYS_PER_WEEK - weekday, daysBetween(from, query.range.to) + 1);
  }
  if (query.grain === "month" && !from.endsWith(MONTH_FIRST)) return Math.min(daysBetween(from, lastDayOfMonth(from)), daysBetween(from, query.range.to)) + 1;
  return null;
}

/** A trend whose first bucket holds only some of its days draws that bucket apart: the step to it is a dashed series whose legend says how many days the bucket holds, so a short first week never reads as a collapse. */
function markLeadingPartial(query: MetricQuery, body: Extract<CardBody, { kind: "line" }>): CardBody {
  const days = leadingPartialDays(query);
  const [actual, ...rest] = body.series;
  if (days === null || !actual || groupDimsOf(query).length > 0 || body.labels.length < 2 || actual.values[0] === null) return body;
  const partial: ChartSeries = { name: TH.dash.partialSeries(body.labels[0], days), values: actual.values.map((value, index) => (index < 2 ? value : null)), style: "dashed" };
  return {
    ...body,
    series: [{ ...actual, values: [null, ...actual.values.slice(1)] }, partial, ...rest],
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

function alertsVerdict(alerts: AlertRow[]): string {
  return TH.read.alerts(alerts.length, alerts.filter((alert) => alert.severity === "P1").length);
}

function chartBodyFor(shape: Shape, view: CardView, extras: CardExtras): CardBody {
  const { query, rows } = shape;
  if (view === "alert_list") return alertsBody(extras.alerts ?? []);
  if (view === "line") {
    const body = lineBody(shape, extras);
    return body.kind === "line" ? markLeadingPartial(shape.query, body) : body;
  }
  if (view === "stacked" || view === "area") {
    const grouped = seriesByGroup(query, rows, true);
    return { kind: "stacked", shape: view === "area" ? "area" : "bar", labels: grouped.labels, series: grouped.series, format: metricFormat(query.metric) };
  }
  if (view === "heatmap") return heatmapBody(query, rows, shape.sortBy);
  if (view === "share") return shareBody(query, rows);
  if (view === "table") return tableBody(query, rows, query.compare !== "none");
  if (view === "metric" || rows.length === 0) return { kind: "none" };
  return tableBody(query, rows, false);
}

/** The group that is largest (a sum) or highest (a rate) over a chart's whole range. */
function largestGroupVerdict(query: MetricQuery, rows: MetricRow[], additive: boolean): string | null {
  const dim = rankDimOf(query);
  if (!dim) return null;
  const totals = new Map<string, number>();
  for (const row of rows) {
    const label = labelAlong([dim], row);
    const value = numericOf(row, "value");
    if (label && value !== null) totals.set(label, (totals.get(label) ?? 0) + value);
  }
  const [top] = [...totals.entries()].sort((left, right) => right[1] - left[1]);
  if (!top) return null;
  return additive ? TH.read.biggest(top[0]) : TH.read.highest(top[0]);
}

/** A grid's verdict: the cells whose change stands apart, named by the row they share when they share one, else how many; or that every cell moved alike. */
function gridVerdict(query: MetricQuery, rows: MetricRow[], additive: boolean): string | null {
  const [first, second] = groupDimsOf(query);
  const changes = rows.map((row) => changeOf(query, row));
  if (!first || !second || changes.every((change) => change === null)) return largestGroupVerdict(query, rows, additive);
  const outliers = outliersOf(changes, MIN_GRID_GAP_PERCENT);
  const picked = [...outliers].flatMap((index) => {
    const change = changes[index];
    return change === null ? [] : [{ row: rows[index], change }];
  });
  const format = metricFormat(query.metric) === "percent" ? (value: number) => TH.read.points(Math.round(value * 10) / 10) : percentText;
  if (picked.length === 0) {
    const known = changes.filter((change): change is number => change !== null);
    const sameWay = known.every((change) => change < 0) || known.every((change) => change > 0);
    const verb = (known[0] ?? 0) < 0 ? TH.read.fell : TH.read.rose;
    return sameWay ? TH.read.allClose(TH.read.every(TH.dash.item), verb, rangeText(known.map(Math.abs), format)) : TH.read.noneStandsOut(TH.dash.item, verb);
  }
  const verb = picked[0].change < 0 ? TH.read.fell : TH.read.rose;
  const range = rangeText(picked.map((entry) => Math.abs(entry.change)), format);
  for (const dim of [first, second]) {
    const names = new Set(picked.map((entry) => labelAlong([dim], entry.row)));
    const [name] = names;
    if (names.size === 1 && name) return TH.read.gridOne(name, verb, TH.dash.dimUnit[dim], range);
  }
  const [lead] = [...picked].sort((left, right) => Math.abs(right.change) - Math.abs(left.change));
  return TH.read.gridSome(picked.length, verb, labelOf(query, lead.row));
}

function chartVerdict(shape: Shape, view: CardView, body: CardBody, extras: CardExtras): string | null {
  if (view === "alert_list") return alertsVerdict(extras.alerts ?? []);
  if (body.kind === "share") return body.slices.length > 0 ? shareVerdict(body.slices.map((slice) => slice.label), body.slices[0].share) : null;
  if (body.kind === "heatmap" && !timeDimOf(shape.query)) return gridVerdict(shape.query, shape.rows, shape.additive);
  return largestGroupVerdict(shape.query, shape.rows, shape.additive);
}

function hiddenGroupsNote(shape: Shape, view: CardView): string | null {
  if (view !== "line" || shape.additive || groupDimsOf(shape.query).length === 0) return null;
  const count = groupCountOf(shape.query, shape.rows);
  return count > MAX_LINES ? TH.dash.shownOf(MAX_LINES, count) : null;
}

/** R10: how answers of one turn draw together; `baselines` is one metric of the same slice asked against two comparisons, drawn as the first card with the second change beside each row; `twin` is two metrics of too few groups for a scatter, drawn as the first breakdown with the second value under each row. */
type Pairing = { view: "scatter" | "gap" | "funnel" | "overlay" | "baselines" | "twin"; sources: Source[] };

function sliceKeyOf(source: Source): string {
  const { query } = source;
  return JSON.stringify([[...query.dims].sort(), query.range.from, query.range.to, query.grain, Object.entries(query.filters ?? {}).sort(([left], [right]) => left.localeCompare(right))]);
}

function holdsOneValue(source: Source): boolean {
  return groupDimsOf(source.query).length === 0 && source.result.rows.length <= 1;
}

/** R10: what a card bound to several metric results of the same dimensions and range draws (a funnel of single values in one unit, lines over the same buckets, a parity gap or a scatter of the same groups), or null when they do not fit together and only the first is shown. */
function pairingOf(first: Source, others: Source[]): Pairing | null {
  const baseline = others.find((other) => sliceKeyOf(other) === sliceKeyOf(first) && other.query.metric === first.query.metric && other.query.compare !== first.query.compare && other.query.compare !== "none");
  if (baseline && first.query.compare !== "none") return { view: "baselines", sources: [first, baseline] };
  const all = [first, ...others.filter((other) => sliceKeyOf(other) === sliceKeyOf(first) && other.query.metric !== first.query.metric)];
  if (all.length < 2) return null;
  if (all.every(holdsOneValue) && sameUnit(all)) return { view: "funnel", sources: all };
  const timeOnly = all.every((source) => timeDimOf(source.query) !== null && groupDimsOf(source.query).length === 0 && source.result.rows.length >= MIN_LINE_BUCKETS);
  if (timeOnly) return { view: "overlay", sources: all };
  const [, second] = all;
  const grouped = groupDimsOf(first.query).length > 0 && !timeDimOf(first.query);
  if (!grouped) return null;
  if (isParityPair(first, second) && joinedRows(first, second).length >= RANK_MIN_ROWS && gapHero(first, second, null)) return { view: "gap", sources: [first, second] };
  const points = joinedRows(first, second).length;
  if (points >= MIN_PLOTTED_SCATTER) return { view: "scatter", sources: [first, second] };
  if (points >= RANK_MIN_ROWS) return { view: "twin", sources: [first, second] };
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
  return overlaidLines(first, others);
}

function shortMetricLabel(source: Source): string {
  return shortMetric(source.query.metric);
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

/** Two summed metrics in one unit read as one against the other: the last as a share of the first over everything the card draws (sell-out as a share of sell-in, sold out as a share of produced). */
function ratioOf(base: Source, other: Source): { hero: CardHero; verdict: string } | null {
  const additive = base.result.headline.aggregate === "sum" && other.result.headline.aggregate === "sum";
  const total = rowTotalOf(base);
  if (!additive || !sameUnit([base, other]) || total === 0) return null;
  const ratio = (rowTotalOf(other) / total) * PERCENT;
  const gap = percentText(Math.abs(ratio - PERCENT));
  const [otherLabel, baseLabel] = [shortMetricLabel(other), shortMetricLabel(base)];
  const verdict = gap === percentText(0) ? TH.read.ratioEven(otherLabel, baseLabel) : ratio > PERCENT ? TH.read.ratioAbove(otherLabel, baseLabel, gap) : TH.read.ratioBelow(otherLabel, baseLabel, gap);
  return {
    hero: { label: TH.read.ratio, value: percentText(ratio), unit: null, delta: null, trend: "neutral", tone: "neutral", detail: null },
    verdict,
  };
}

function totalTile(source: Source): Tile {
  return tileOf(shortMetricLabel(source), source.result.headline.value, null);
}

function correlationVerdict(scatter: Extract<CardBody, { kind: "scatter" }>): string {
  const [x, y] = [scatter.x.label.replace(PARENTHETICAL, ""), scatter.y.label.replace(PARENTHETICAL, "")];
  if (Math.abs(scatter.r) < STRONG_CORRELATION) return TH.read.apart(x, y);
  return scatter.r > 0 ? TH.read.together(x, y) : TH.read.opposite(x, y);
}

function pairedLead(pairing: Pairing, body: CardBody, indexed: boolean): { hero: CardHero | null; tiles: Tile[]; verdict: string | null } {
  const [first, ...others] = pairing.sources;
  const last = others[others.length - 1];
  if (pairing.view === "scatter") return { hero: null, tiles: NO_TILES, verdict: body.kind === "scatter" ? correlationVerdict(body) : null };
  if (pairing.view === "funnel") {
    const ratio = ratioOf(first, last);
    return { hero: ratio?.hero ?? null, tiles: NO_TILES, verdict: ratio?.verdict ?? null };
  }
  const ratio = indexed || others.length !== 1 ? null : ratioOf(first, last);
  if (!ratio) return { hero: indexed ? null : heroOf(first.query, first.result), tiles: NO_TILES, verdict: null };
  return { hero: ratio.hero, tiles: [totalTile(first), totalTile(last)], verdict: ratio.verdict };
}

function actionsOf(actions: readonly NextAction[]): { primary: NextAction | null; more: NextAction[] } {
  const [primary = null, ...more] = actions;
  return { primary, more };
}

function pairedCard(input: PresentInput, pairing: Pairing): CardParts {
  const [first, ...others] = pairing.sources;
  const indexed = pairing.view === "overlay" && isIndexedOverlay(first, others);
  const body = pairedBody(pairing);
  const lead = pairedLead(pairing, body, indexed);
  return {
    title: pairedTitleOf(pairing),
    style: lead.tiles.length > 0 ? "scorecard" : "chart",
    verdict: lead.verdict === null ? null : spaced(lead.verdict),
    hero: lead.hero,
    tiles: lead.tiles,
    body,
    ...actionsOf(input.actions ?? NO_ACTIONS),
    footer: footerOf(first.query, first.result, [indexed ? TH.dash.indexedNote : null]),
    denied: null,
  };
}

function baselineText(source: Source, change: string | null): string | null {
  const label = source.result.headline.compareLabel ?? TH.dash.compare[source.query.compare];
  return change === null ? null : `${change} ${label}`;
}

/** A breakdown card with a second line under each row it names (`subs`, by row label) and an extra fact beside its hero. */
function withSecondLine(card: CardParts, subs: ReadonlyMap<string, string | null>, heroExtra: string | null): CardParts {
  const subOf = (row: ReadRow): ReadRow => ({ ...row, sub: subs.get(row.label) ?? row.sub });
  const hero = card.hero && heroExtra ? { ...card.hero, detail: joined([card.hero.detail, heroExtra]) } : card.hero;
  const overallOf = (row: ReadRow | null): ReadRow | null => (row && heroExtra ? { ...row, sub: joined([row.sub, heroExtra]) } : row);
  const strip = (current: Strip): Strip => ({ ...current, overall: overallOf(current.overall), rows: current.rows.map(subOf) });
  const body = card.body;
  if (body.kind === "strip") return { ...card, hero, body: { ...body, strip: strip(body.strip) } };
  if (body.kind === "exceptions") return { ...card, hero, body: { ...body, strip: strip(body.strip), fold: body.fold ? { ...body.fold, rows: body.fold.rows.map(subOf) } : null } };
  return { ...card, hero };
}

/** One metric asked against two baselines draws one card: the first answer's card, the second comparison beside the hero and under each row it names. */
function withBaseline(card: CardParts, second: Source): CardParts {
  const { query, result } = second;
  const subs = new Map(result.rows.map((row) => [labelOf(query, row), baselineText(second, changeTextOf(query.metric, row))]));
  return withSecondLine(card, subs, baselineText(second, formatChange(query.metric, result.headline.deltaPercent, result.headline.deltaPoints ?? null)));
}

/** Two metrics of a few groups (too few points for a scatter to say anything) read as the first metric's breakdown with the second metric's value under every row, so both numbers the reply relies on are on the card. */
function withSecondMetric(card: CardParts, pairing: Pairing): CardParts {
  const [, second] = pairing.sources;
  const subs = new Map(second.result.rows.map((row) => [labelOf(second.query, row), `${valueTextOf(second.query, row)} ${shortMetricLabel(second)}`]));
  return { ...withSecondLine(card, subs, null), title: pairedTitleOf(pairing) };
}

/** R10 parity (sell-out against sell-in by agent) in the B anatomy: the overall share on top, the things falling well short drawn thick with their share, the rest muted; the count that falls short is the verdict. */
function parityCard(input: PresentInput, pairing: Pairing): CardParts {
  const [first, second] = pairing.sources;
  const dim = rankDimOf(first.query);
  const unit = dim ? TH.dash.dimUnit[dim] : TH.dash.item;
  const hero = gapHero(first, second, unit);
  if (!hero) return presentCard({ ...input, others: [] });
  const reading = parityReading({ gaps: parityGaps(first, second), hero: { ...hero, detail: null }, verdict: hero.detail ?? "", unit });
  return breakdownCard({ title: pairedTitleOf(pairing), ...actionsOf(input.actions ?? NO_ACTIONS), footer: footerOf(first.query, first.result, []), denied: null }, reading);
}

function okSources(others: PresentSource[] | undefined): Source[] {
  return (others ?? []).flatMap((other) => (other.result.ok ? [{ query: other.query, result: other.result }] : []));
}

export type PresentAlertsInput = {
  title: string;
  alerts: AlertRow[];
  actions?: NextAction[];
};

/** A list of anomalies as a card: how many and how many are urgent as the verdict, then each signal with severity, scope, observed against expected and the hypothesis. */
export function presentAlerts(input: PresentAlertsInput): CardParts {
  return {
    title: input.title,
    style: "chart",
    verdict: spaced(alertsVerdict(input.alerts)),
    hero: null,
    tiles: NO_TILES,
    body: alertsBody(input.alerts),
    ...actionsOf(input.actions ?? NO_ACTIONS),
    footer: null,
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

function everyValueMasked(result: OkResult): boolean {
  return result.provenance.masked.includes("value") && result.rows.length > 0 && result.rows.every((row) => row.value === MASKED || row.value === null);
}

function maskedCard(input: PresentInput, result: OkResult): CardParts {
  const dim = rankDimOf(input.query);
  const names = dim && result.rows.length > 1 ? result.rows.slice(0, MAX_RANK_ROWS).map((row) => ({ label: labelOf(input.query, row) })) : [];
  return {
    title: input.title,
    style: "chart",
    verdict: null,
    hero: null,
    tiles: NO_TILES,
    body: dim && names.length > 0 ? { kind: "locked", rows: [], locked: names, askHref: null } : { kind: "none" },
    ...actionsOf(input.actions ?? NO_ACTIONS),
    footer: null,
    denied: { title: TH.dash.denied, body: TH.dash.maskedAll(dim && names.length > 0 ? TH.dash.dimUnit[dim] : null) },
  };
}

export type ForecastPoint = { week: string; date: string; value: number; lo: number; hi: number; value_label: string };
export type ForecastAnswer = { metric: MetricId; total: number | null; mape: number | null; weeks: ForecastPoint[] };

export type PresentForecastInput = {
  title: string;
  forecast: ForecastAnswer;
  history: PresentSource | null;
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
    return { label: TH.dash.forecastTotal(points.length), value: formatMetricValue(forecast.metric, forecast.total), unit: null, delta: null, trend: "neutral", tone: "neutral", detail };
  }
  return { label: TH.dash.forecastLast(last.week), value: last.value_label, unit: null, delta: null, trend: "neutral", tone: "neutral", detail };
}

function averageOf(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** The forecast weeks against the latest actual weeks when the card has them, else what it forecasts. */
function forecastVerdict(forecast: ForecastAnswer, history: { value: number }[]): string {
  const recent = history.slice(-RECENT_WEEKS).map((point) => point.value);
  if (recent.length < RECENT_WEEKS || averageOf(recent) === 0) return forecastTrendVerdict(forecast);
  const change = ((averageOf(forecast.weeks.map((point) => point.value)) - averageOf(recent)) / Math.abs(averageOf(recent))) * PERCENT;
  if (directionOf(change) === "neutral") return TH.read.forecast(forecast.weeks.length);
  return TH.read.forecastMove(forecast.weeks.length, change < 0 ? TH.read.fell : TH.read.rose, percentText(Math.abs(change)), RECENT_WEEKS);
}

/** Without actual weeks beside it, the forecast reads as its last week against its first. */
function forecastTrendVerdict(forecast: ForecastAnswer): string {
  const first = forecast.weeks[0]?.value ?? 0;
  const last = forecast.weeks[forecast.weeks.length - 1]?.value ?? 0;
  const change = first === 0 ? 0 : ((last - first) / Math.abs(first)) * PERCENT;
  if (directionOf(change) === "neutral") return TH.read.forecast(forecast.weeks.length);
  return TH.read.forecastTrend(forecast.weeks.length, change < 0 ? TH.read.fell : TH.read.rose, percentText(Math.abs(change)));
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

/** A get_forecast answer as a card: the weekly forecast with its band after the actual weeks, the total or last week as the headline, and the back-tested error beside it rather than as a change. */
export function presentForecast(input: PresentForecastInput): CardParts {
  const { forecast } = input;
  const points = forecast.weeks;
  const empty: CardParts = { title: input.title, style: "chart", verdict: null, hero: null, tiles: NO_TILES, body: { kind: "none" }, primary: null, more: NO_ACTIONS, footer: null, denied: null };
  if (points.length === 0) return empty;
  const history = historyPoints(input.history);
  return {
    ...empty,
    verdict: spaced(forecastVerdict(forecast, history)),
    hero: forecastHero(forecast),
    body: forecastBody(forecast, history),
    footer: { line: `${TH.dash.forecastScope(points[0].week, points[points.length - 1].week, points.length)}`, verified: false, details: TH.dash.forecastMethod },
  };
}

function locksBreakdown(query: MetricQuery, locked: LockedRows): boolean {
  const groups = groupDimsOf(query);
  return locked.labels.length > 0 && !timeDimOf(query) && groups.length === 1 && groups[0] === locked.dim;
}

/** A shared card that holds rows back: the viewer's own rows in their usual order, then one locked row per hidden name in the order given; the headline is the viewer's own figure, labelled with the rows it covers, so nothing about the hidden rows can be worked out from it. */
function lockedCard(input: PresentInput, result: OkResult, rows: MetricRow[], locked: LockedRows): CardParts {
  const { query } = input;
  const visible = rankRowsOf(query, rows);
  const own = visible.map((row) => row.label).join(", ");
  const move = headlineMoveOf(query, result);
  return {
    title: input.title,
    style: "chart",
    verdict: spaced(summaryVerdict({ label: own, attainment: null, change: metricFormat(query.metric) === "percent" ? (result.headline.deltaPoints ?? null) : result.headline.deltaPercent, changeText: move.delta, flat: isFlat(move), versus: result.headline.compareLabel ?? "", value: result.headline.value })),
    hero: { ...heroOf(query, result), label: TH.dash.ownScope(metricLabel(query.metric), own) },
    tiles: NO_TILES,
    body: { kind: "locked", rows: visible, locked: locked.labels.map((label) => ({ label })), askHref: locked.askHref },
    ...actionsOf(input.actions ?? NO_ACTIONS),
    footer: footerOf(query, result, []),
    denied: null,
  };
}

function breakdownCard(base: Omit<CardParts, "style" | "verdict" | "hero" | "body" | "tiles">, reading: Breakdown): CardParts {
  if (fitsOneStrip(reading)) return { ...base, style: "picture", verdict: spaced(reading.verdict), hero: reading.hero, tiles: NO_TILES, body: { kind: "strip", strip: stripOf(reading) } };
  const { strip, fold } = exceptionsOf(reading);
  return { ...base, style: "exceptions", verdict: spaced(reading.verdict), hero: reading.lead?.hero ?? reading.hero, tiles: NO_TILES, body: { kind: "exceptions", strip, fold } };
}

/** R2 for a split over time: groups over a single bucket ("this month by business unit") are a breakdown by the groups, never a chart of lone dots; null when the time axis holds more than one bucket. */
function oneBucketBreakdown(query: MetricQuery, rows: MetricRow[]): MetricQuery | null {
  const groups = groupDimsOf(query);
  if (!timeDimOf(query) || groups.length === 0 || bucketCountOf(query, rows) !== 1) return null;
  return { ...query, dims: groups };
}

function leadOf(facts: Facts, fit: Fit, rows: MetricRow[], view: CardView): Lead | null {
  if (fit.hero === "single") return singleLead(facts);
  if (fit.hero === "latest") return latestLead(facts);
  if (fit.look === "summary") return summaryLead(facts, shortMetric(facts.query.metric), heroLabelOf(facts.query, facts.result));
  if (fit.hero === "leader") return { hero: leaderHero({ ...facts, rows }), tiles: NO_TILES, verdict: "" };
  if (fit.hero === "reading" && rows.length > 0) {
    const reading = readingOf(facts, fit.bars, rows);
    return { hero: reading.hero, tiles: NO_TILES, verdict: view === "bar" || view === "metric" ? reading.verdict : "" };
  }
  return null;
}

/**
 * Every data card in Winyu, drawn from the decision table (`CARD_RULES`): the verdict and the hero that answer, the style and body the data deserves,
 * the next steps and the footer. The dashboard and the chat both draw it.
 */
export function presentCard(input: PresentInput): CardParts {
  const { query, result, title } = input;
  const actions = actionsOf(input.actions ?? NO_ACTIONS);
  if (!result.ok) {
    return { title, style: "chart", verdict: null, hero: null, tiles: NO_TILES, body: { kind: "none" }, primary: null, more: NO_ACTIONS, footer: null, denied: refusalNoticeOf(result.code, result.error) };
  }
  if (everyValueMasked(result)) return maskedCard(input, result);
  const extras = input.extras ?? NO_EXTRAS;
  const hidden = result.rows.filter(isHiddenRow).length;
  const visibleRows = hidden > 0 ? result.rows.filter((row) => !isHiddenRow(row)) : result.rows;
  const masked = result.provenance.masked.length > 0 && hidden === 0;
  const sortBy = input.sortBy ?? query.sort ?? null;
  if (input.locked && !masked && hidden === 0 && locksBreakdown(query, input.locked)) return lockedCard(input, result, sorted(query, visibleRows, sortBy), input.locked);
  const oneBucket = oneBucketBreakdown(query, visibleRows);
  if (oneBucket) return presentCard({ ...input, query: oneBucket });
  const pairing = masked || hidden > 0 ? null : pairingOf({ query, result }, okSources(input.others));
  if (pairing?.view === "baselines") return withBaseline(presentCard({ ...input, others: [] }), pairing.sources[1]);
  if (pairing?.view === "twin") return withSecondMetric(presentCard({ ...input, others: [] }), pairing);
  if (pairing?.view === "gap") return parityCard(input, pairing);
  if (pairing) return pairedCard(input, pairing);
  const whole: Shape = { query, rows: visibleRows, additive: result.headline.aggregate === "sum", sortBy };
  const facts = factsOf(whole, result);
  const fit = fitOf(facts);
  const view = hidden > 0 && visibleRows.length < RANK_MIN_ROWS ? "table" : viewFor(whole, input.view ?? "auto", masked, extras, fit);
  const trimmed = withoutPartialBucket(query, view, visibleRows, result.provenance.asOf);
  const shape: Shape = { ...whole, rows: sorted(query, trimmed.rows, sortBy) };
  const footer = footerOf(query, result, [trimmed.note, hiddenGroupsNote(shape, view), hiddenLineOf(query, hidden), paceNoteOf(query, result.provenance.asOf), projectionNote(result)]);
  const base = { title, ...actions, footer, denied: null };
  const quiet = masked || hidden > 0;
  const barsDrawn = view === "bar" && fit.look === "breakdown" && shape.rows.length > 0 && (shape.rows.length >= RANK_MIN_ROWS || fit.bars === "level");
  if (barsDrawn && !quiet) return breakdownCard(base, readingOf(facts, fit.bars, shape.rows));
  const body = barsDrawn ? tableBody(query, shape.rows, query.compare !== "none") : chartBodyFor(shape, view, extras);
  if (quiet || view === "alert_list") return { ...base, style: "chart", verdict: view === "alert_list" ? alertsVerdict(extras.alerts ?? []) : null, hero: null, tiles: NO_TILES, body };
  const lead = leadOf({ ...facts, rows: shape.rows }, fit, shape.rows, view) ?? { hero: heroOf(query, result), tiles: NO_TILES, verdict: "" };
  const verdict = lead.verdict || chartVerdict(shape, view, body, extras) || summaryLead(facts, shortMetric(query.metric), heroLabelOf(query, result)).verdict;
  const shown = body.kind === "share" && body.centerValue === lead.hero.value ? { ...body, centerValue: "" } : body;
  return { ...base, style: lead.tiles.length > 0 ? "scorecard" : "chart", verdict: spaced(verdict), hero: lead.hero, tiles: lead.tiles, body: shown };
}
