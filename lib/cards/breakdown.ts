import type { MetricId, MetricQuery, MetricResult, MetricRow } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { DECIDING_LINES, LOW_COVER_DAYS } from "@/lib/semantic/metrics";
import { changeDirectionOf, changeToneOf, directionOf, formatChange, formatDelta, formatMetricValue, metricFormat, toneOf, type Direction, type Tone } from "@/lib/dashboard/metric-display";
import { changeTextOf, deltaPercentOf, deltaPointsOf, labelOf, numericOf, timeDimOf, valueTextOf } from "./rows";
import {
  boardVerdict,
  changeVerdict,
  claimedFloor,
  leadingExceptions,
  meetsClaim,
  lineVerdict,
  outliersOf,
  percentText,
  rangeText,
  referenceVerdict,
  spaced,
  summaryVerdict,
  thresholdVerdict,
  type Fold,
  type LineKind,
  type ReadRow,
  type Strip,
  type StripForm,
} from "./reading";
import type { CardHero } from "./present";
import type { ParityGap } from "./chart-bodies";

type OkResult = Extract<MetricResult, { ok: true }>;

/** A level read against a line rather than from zero: where the line sits, which line it is for the verdict, what the rows under it are called, and what the rows over it are called in a folded line. */
export type LevelLine = { at: number; line: LineKind; underLabel: string; aboveWords: string };

const PERCENT = 100;
const MAX_STRIP_ROWS = 8;
const LEADERS = 3;
const MIN_GAP_PERCENT = 5;
const MIN_GAP_POINTS = 1;
const REFERENCE_GAP_SHARE = 0.1;
const SCALE_PAD = 0.04;
const MIN_PEAK_PERCENT = 10;
const MIN_PEAK_POINTS = 2;
const PERCENT_NUMBER = /^[+−-]?[\d,]+(\.\d+)?%$/;

/** The 100% target line. */
export const TARGET_LINE: LevelLine = {
  at: DECIDING_LINES.target_attainment ?? PERCENT,
  line: { kind: "target" },
  underLabel: TH.dash.underTarget,
  aboveWords: TH.read.aboveTarget,
};

/** The metrics whose level is read against a deciding line. */
export const LEVEL_LINES: Partial<Record<MetricId, LevelLine>> = {
  target_attainment: TARGET_LINE,
  days_of_cover: { at: LOW_COVER_DAYS, line: { kind: "cover", days: LOW_COVER_DAYS }, underLabel: TH.dash.underCover(LOW_COVER_DAYS), aboveWords: TH.read.aboveCover(LOW_COVER_DAYS) },
};

/** Which bars a breakdown draws: distance from a deciding line, value over target around 100%, the change, value from zero as a leaderboard, or a rate around its reference level. */
export type BreakdownBars = "level" | "target" | "change" | "board" | "reference";

/** The change a list ranked by change is ordered and drawn by: points for a percent metric, relative percent otherwise. */
export function changeOf(query: MetricQuery, row: MetricRow): number | null {
  return metricFormat(query.metric) === "percent" ? deltaPointsOf(row) : deltaPercentOf(row);
}

/** A row's value over its target, in percent, when the result compares against a target. */
export function attainmentOf(row: MetricRow): number | null {
  const delta = deltaPercentOf(row);
  return delta === null ? null : PERCENT + delta;
}

/** A number the engine already wrote as a percent ("97.2%"), or null when the text is anything else. */
export function percentIn(text: string): number | null {
  const trimmed = text.trim();
  if (!PERCENT_NUMBER.test(trimmed)) return null;
  return Number(trimmed.replace("−", "-").replace(/[,%]/g, ""));
}

/** What a breakdown's target figures are a share of: the target to date in a month still running ("ตามเวลา"), and, when the result carries them, the whole month's share done, what is left to it and how much of the month has passed (0 to 1), which put every row on the whole month's base (AI-141). */
export type TargetBase = { paced: boolean; month: { attainment: string; left: string | null; elapsed: number } | null };

function scaled(value: number | null, scale: number): number | null {
  return value === null ? null : value * scale;
}

/** What the decision table knows about one breakdown: its rows in the order asked, the bars it draws, the unit word, the overall row's label, whether the question set a threshold (R7), and what a target figure is a share of ("ของเป้าตามเวลา" in a month still running) with the whole month beside it, the base total a change ranking moved from, whether the line is read from above (the top of a capped ranking, or rows above a value), whether the list was cut by a limit, so its verdict speaks for the rows shown, never for every group, and the rows the question named. */
export type BreakdownInput = { query: MetricQuery; result: OkResult; rows: MetricRow[]; bars: BreakdownBars; unit: string; scope: string; threshold: boolean; additive: boolean; falling: boolean; target: TargetBase; baseTotal: string | null; high: boolean; capped: boolean; asked: ReadonlySet<string> };

/** A breakdown read for styles B and A: the strip, the verdict, the hero the overall row stands for, the row style A leads with instead (a change ranking), and how the rows style A folds away read in one line. */
export type Breakdown = {
  form: StripForm;
  baseline: number;
  overall: ReadRow | null;
  rows: ReadRow[];
  verdict: string;
  hero: CardHero;
  lead: { row: string; hero: CardHero } | null;
  pickWhenNone: number;
  fold: (rest: ReadRow[], drawn: number) => string;
};

function moveOf(query: MetricQuery, deltaPercent: number | null, deltaPoints: number | null): { delta: string | null; trend: Direction; tone: Tone } {
  const delta = formatChange(query.metric, deltaPercent, deltaPoints);
  if (delta === null) return { delta, trend: "neutral", tone: "neutral" };
  return { delta, trend: changeDirectionOf(query.metric, deltaPercent, deltaPoints), tone: changeToneOf(query.metric, deltaPercent, deltaPoints) };
}

function headlineMove(query: MetricQuery, result: OkResult): { delta: string | null; trend: Direction; tone: Tone } {
  return moveOf(query, result.headline.deltaPercent, result.headline.deltaPoints ?? null);
}

function rowMove(query: MetricQuery, row: MetricRow): { delta: string | null; trend: Direction; tone: Tone } {
  return moveOf(query, deltaPercentOf(row), deltaPointsOf(row));
}

function foldLine(unit: string, what: (rest: ReadRow[]) => string | null, values: (rest: ReadRow[]) => number[], format: (value: number) => string) {
  return (rest: ReadRow[], drawn: number): string => {
    const known = values(rest);
    const range = known.length > 0 ? rangeText(known, format) : "";
    if (drawn === 0) return spaced(TH.read.restAll(rest.length, unit, range));
    const words = what(rest);
    return spaced(words ? TH.read.restOver(rest.length, unit, words, range) : TH.read.restMore(rest.length, unit, range));
  };
}

function joinedText(parts: readonly (string | null)[]): string {
  return parts.filter((part): part is string => Boolean(part)).join(" · ");
}

function measuresOf(rows: ReadRow[]): number[] {
  return rows.flatMap((row) => (row.measure === null ? [] : [row.measure]));
}

/** R6 read from above: a question about stock piling up (cover ranked highest first, or rows above a value) leads with the row furthest over the line, the rows standing clear at the top drawn as exceptions. */
function aboveLineReading(input: BreakdownInput, line: LevelLine): Breakdown {
  const { query, result } = input;
  const scored = input.rows.map((row) => ({ row, measure: numericOf(row, "value") })).sort((left, right) => (right.measure ?? -Infinity) - (left.measure ?? -Infinity));
  const known = scored.flatMap((entry) => (entry.measure === null ? [] : [entry.measure]));
  const leading = Math.max(1, leadingExceptions(known, MIN_GAP_POINTS));
  const peak = Math.max(line.at, ...known);
  const rows: ReadRow[] = scored.map((entry, index) => ({
    label: labelOf(query, entry.row),
    sub: null,
    measure: entry.measure,
    fill: entry.measure === null ? 0 : Math.min(1, Math.max(0, entry.measure / peak)),
    text: valueTextOf(query, entry.row),
    change: null,
    tone: "neutral",
    exception: index < leading,
    valued: index < leading || index === scored.length - 1,
  }));
  const [top] = scored;
  const topLabel = top ? labelOf(query, top.row) : input.scope;
  const topText = top ? valueTextOf(query, top.row) : result.headline.value;
  const threshold = input.threshold && query.where ? TH.read.cover.over(query.where.value) : null;
  const verdict = threshold ? TH.read.countOf(rows.length, result.headline.underLine?.of ?? rows.length, input.unit, threshold) : TH.read.cover.most(topLabel, topText);
  return {
    form: "line",
    baseline: line.at,
    overall: null,
    rows,
    verdict,
    hero: { label: TH.dash.rowHero(TH.dash.highest, topLabel), value: topText, unit: null, delta: null, trend: "neutral", tone: "neutral", detail: `${input.scope} ${result.headline.value}` },
    lead: null,
    pickWhenNone: LEADERS,
    fold: foldLine(input.unit, () => null, measuresOf, (value) => formatMetricValue(query.metric, value)),
  };
}

/** What a period was against its target in the metric's own unit ("1.8 ล้านลิตร · เป้า 1.8 ล้านลิตร"), so a month asked about shows its figure and its target, not only the share. */
function targetSubOf(query: MetricQuery, row: MetricRow): string | null {
  const target = numericOf(row, "compare_value");
  return target === null ? null : TH.read.againstTarget(valueTextOf(query, row), formatMetricValue(query.metric, target));
}

/** R3 and R6: groups read against the deciding line, the furthest under first; periods (a short series against target) stay in time order, each with its value and target. */
function lineReading(input: BreakdownInput, line: LevelLine): Breakdown {
  const { query, result } = input;
  if (input.high && line.line.kind === "cover") return aboveLineReading(input, line);
  const overTarget = query.compare === "target" && query.metric !== "target_attainment";
  const overTime = timeDimOf(query) !== null;
  const ofTarget = line.line.kind === "target";
  const month = ofTarget && overTarget && !overTime ? input.target.month : null;
  const scale = month?.elapsed ?? 1;
  const at = line.at * scale;
  const measureOf = (row: MetricRow) => (overTarget ? scaled(attainmentOf(row), scale) : numericOf(row, "value"));
  const measured = input.rows.map((row) => ({ row, measure: measureOf(row) }));
  const scored = overTime ? measured : measured.sort((left, right) => (left.measure ?? Infinity) - (right.measure ?? Infinity));
  const under = scored.filter((entry) => entry.measure !== null && entry.measure < at).sort((left, right) => (left.measure ?? 0) - (right.measure ?? 0));
  const answer = line.line.kind === "cover" && under.length === 0 && !input.threshold ? scored[0] : null;
  const peak = Math.max(at, ...scored.map((entry) => entry.measure ?? 0));
  const textOf = (entry: { row: MetricRow; measure: number | null }) => (overTarget ? (entry.measure === null ? "—" : percentText(entry.measure)) : valueTextOf(query, entry.row));
  const rows: ReadRow[] = scored.map((entry, index) => {
    const isUnder = entry.measure !== null && entry.measure < at;
    const emphasised = isUnder || entry === answer;
    return {
      label: labelOf(query, entry.row),
      sub: overTime && overTarget ? targetSubOf(query, entry.row) : null,
      measure: entry.measure,
      fill: entry.measure === null ? 0 : Math.min(1, Math.max(0, entry.measure / (ofTarget ? PERCENT : peak))),
      text: textOf(entry),
      change: null,
      tone: isUnder ? "bad" : "neutral",
      exception: emphasised,
      valued: overTime || emphasised || index === scored.length - 1,
    };
  });
  const overallMeasure = overTarget ? (result.headline.deltaPercent === null ? null : PERCENT + result.headline.deltaPercent) : ofTarget ? percentIn(result.headline.value) : null;
  const overallUnder = overallMeasure !== null && overallMeasure < line.at;
  const overallTone: Tone = overallUnder ? "bad" : "neutral";
  const overallText = overTarget && overallMeasure !== null ? percentText(overallMeasure) : result.headline.value;
  const count = result.headline.underLine?.count ?? under.length;
  const of = result.headline.underLine?.of ?? scored.length;
  const format = overTarget ? percentText : (value: number) => formatMetricValue(query.metric, value);
  const fold = foldLine(input.unit, () => line.aboveWords, measuresOf, format);
  const goalUnit = input.target.paced ? TH.read.ofPacedTarget : TH.read.ofTarget;
  const monthDetail = month ? joinedText([TH.read.paceMark(percentText(at)), month.left ? `${TH.read.toTarget} ${month.left}` : null]) : null;
  if (input.threshold) {
    return {
      form: "line",
      baseline: at,
      overall: null,
      rows,
      verdict: thresholdVerdict(count, of, input.unit, line.underLabel),
      hero: { label: line.underLabel, value: TH.dash.countOf(count, of, input.unit), unit: null, delta: null, trend: "neutral", tone: count > 0 ? "bad" : "neutral", detail: null },
      lead: null,
      pickWhenNone: 0,
      fold,
    };
  }
  const change = overTarget ? { delta: formatDelta(result.headline.deltaPercent), trend: directionOf(result.headline.deltaPercent), tone: overallTone } : headlineMove(query, result);
  return {
    form: "line",
    baseline: at,
    overall: overTime ? null : month ? { label: input.scope, sub: joinedText([TH.read.ofMonthTarget, monthDetail]), measure: percentIn(month.attainment), fill: 0, text: month.attainment, change: null, tone: overallTone, exception: true, valued: true } : { label: input.scope, sub: ofTarget ? goalUnit : null, measure: overallMeasure, fill: 0, text: overallText, change: null, tone: overallTone, exception: true, valued: true },
    rows,
    verdict: lineVerdict({
      line: line.line,
      unit: input.unit,
      count,
      of,
      worst: under[0] ? labelOf(query, under[0].row) : null,
      overallUnder: overallUnder && !overTime,
      goal: input.target.paced ? TH.read.pacedGoal : TH.read.goal,
      sums: input.additive,
      weakest: answer ? { label: labelOf(query, answer.row), text: textOf(answer) } : null,
      slice: input.capped && !result.headline.underLine ? TH.read.shown(rows.length, input.unit) : null,
    }),
    hero: month
      ? { label: input.scope, value: month.attainment, unit: TH.read.ofMonthTarget, delta: null, trend: overallUnder ? "down" : "neutral", tone: overallTone, detail: monthDetail }
      : { label: input.scope, value: overallText, unit: ofTarget ? goalUnit : null, delta: change.delta, trend: change.trend, tone: ofTarget ? overallTone : change.tone, detail: ofTarget ? null : result.headline.compareLabel },
    lead: null,
    pickWhenNone: 0,
    fold,
  };
}

/** What a row was compared with, named by its window ("ปีก่อน 1.3 ล้านบาท"), so a change never stands without the number it moved from; null against a target or with nothing to compare. */
export function baseOf(query: MetricQuery, row: MetricRow): string | null {
  const word = TH.read.base[query.compare];
  const previous = numericOf(row, "compare_value");
  return word && previous !== null ? `${word} ${formatMetricValue(query.metric, previous)}` : null;
}

function levelAndBase(query: MetricQuery, row: MetricRow): string | null {
  const base = baseOf(query, row);
  return base ? `${valueTextOf(query, row)} · ${base}` : null;
}

type ScoredChange = { row: MetricRow; measure: number };

/** The rows a change ranking's verdict speaks for: the leading exceptions, then every other row that moved the asked way at least as far as the verdict's words claim, so "กว่าเท่าตัว" counts every row that more than doubled (AI-144). */
function claimedRows(known: readonly ScoredChange[], leading: number, falling: boolean, inPoints: boolean): ScoredChange[] {
  const leaders = known.slice(0, leading);
  if (leaders.length === 0) return leaders;
  const floor = claimedFloor(Math.min(...leaders.map((entry) => Math.abs(entry.measure))), leaders.length > 1, inPoints ? "points" : "percent");
  if (!floor) return leaders;
  const askedWay = (measure: number) => (falling ? measure < 0 : measure > 0);
  return known.filter((entry, index) => index < leading || (askedWay(entry.measure) && meetsClaim(Math.abs(entry.measure), floor)));
}

function changeReading(input: BreakdownInput): Breakdown {
  const { query, result } = input;
  const inPoints = metricFormat(query.metric) === "percent";
  const scored = input.rows.map((row) => ({ row, measure: changeOf(query, row) }));
  const known = scored.filter((entry): entry is { row: MetricRow; measure: number } => entry.measure !== null);
  const first = known[0]?.measure ?? 0;
  const wrongWay = input.falling ? first >= 0 : first <= 0;
  const leading = wrongWay ? 0 : leadingExceptions(known.map((entry) => entry.measure), inPoints ? MIN_GAP_POINTS : MIN_GAP_PERCENT);
  const claimed = claimedRows(known, leading, input.falling, inPoints);
  const exceptions = new Set(claimed.map((entry) => entry.row));
  const peak = Math.max(inPoints ? MIN_PEAK_POINTS : MIN_PEAK_PERCENT, ...known.map((entry) => Math.abs(entry.measure)));
  const format = inPoints ? (value: number) => TH.read.points(Math.round(value * 10) / 10) : percentText;
  const rows: ReadRow[] = scored.map((entry, index) => {
    const exception = exceptions.has(entry.row);
    return {
      label: labelOf(query, entry.row),
      sub: levelAndBase(query, entry.row),
      measure: entry.measure,
      fill: entry.measure === null ? 0 : Math.min(1, Math.abs(entry.measure) / (inPoints ? peak : PERCENT)),
      text: changeTextOf(query.metric, entry.row) ?? "—",
      change: null,
      tone: exception ? rowMove(query, entry.row).tone : "neutral",
      exception,
      valued: exception || index === scored.length - 1,
    };
  });
  const overall = headlineMove(query, result);
  const overallMeasure = inPoints ? (result.headline.deltaPoints ?? null) : result.headline.deltaPercent;
  const [leadRow] = known;
  const sameWay = (rest: ReadRow[]) => rest.every((row) => row.measure !== null && (input.falling ? row.measure < 0 : row.measure > 0));
  return {
    form: "line",
    baseline: 0,
    overall: { label: input.scope, sub: input.baseTotal ?? result.headline.compareLabel, measure: overallMeasure, fill: 0, text: overall.delta ?? "—", change: null, tone: overall.tone, exception: true, valued: true },
    rows,
    verdict: changeVerdict({
      unit: input.unit,
      falling: input.falling,
      sums: input.additive && TH.read.base[query.compare] !== undefined,
      inPoints,
      leading: claimed.map((entry) => ({ label: labelOf(query, entry.row), size: Math.abs(entry.measure) })),
      changes: known.map((entry) => entry.measure),
      format,
      slice: input.capped ? TH.read.topMovers(input.rows.length, input.unit, input.falling ? TH.read.fell : TH.read.rose) : null,
    }),
    hero: { label: input.scope, value: overall.delta ?? result.headline.value, unit: null, delta: null, trend: overall.trend, tone: overall.tone, detail: input.baseTotal ?? result.headline.compareLabel },
    lead: leadRow && leading > 0 ? { row: labelOf(query, leadRow.row), hero: { label: labelOf(query, leadRow.row), value: valueTextOf(query, leadRow.row), unit: null, ...rowMove(query, leadRow.row), detail: baseOf(query, leadRow.row) ?? result.headline.compareLabel } } : null,
    pickWhenNone: wrongWay ? 0 : LEADERS,
    fold: foldLine(input.unit, (rest) => (sameWay(rest) ? (input.falling ? TH.read.fell : TH.read.rose) : null), (rest) => measuresOf(rest).map((value) => (sameWay(rest) ? Math.abs(value) : value)), (value) => (inPoints ? format(value) : percentText(value))),
  };
}

function boardReading(input: BreakdownInput): Breakdown {
  const { query, result } = input;
  const inPoints = metricFormat(query.metric) === "percent";
  const changes = input.rows.map((row) => changeOf(query, row));
  const notable = outliersOf(changes, inPoints ? MIN_GAP_POINTS : MIN_GAP_PERCENT);
  const values = input.rows.map((row) => numericOf(row, "value"));
  const peak = Math.max(...values.map((value) => Math.abs(value ?? 0)), 0);
  const usual = medianOf(changes.flatMap((change, index) => (change === null || notable.has(index) ? [] : [change])));
  const deviationTone = (change: number | null): Tone => (change === null ? "neutral" : toneOf(query.metric, change > usual ? PERCENT : -PERCENT));
  const rows: ReadRow[] = input.rows.map((row, index) => ({
    label: labelOf(query, row),
    sub: null,
    measure: values[index],
    fill: peak === 0 ? 0 : Math.abs(values[index] ?? 0) / peak,
    text: valueTextOf(query, row),
    change: changeTextOf(query.metric, row),
    tone: notable.has(index) ? deviationTone(changes[index]) : "neutral",
    exception: notable.has(index),
    valued: true,
  }));
  const overall = headlineMove(query, result);
  const format = inPoints ? (value: number) => TH.read.points(Math.round(value * 10) / 10) : percentText;
  return {
    form: "board",
    baseline: 0,
    overall: { label: input.scope, sub: overall.delta ? result.headline.compareLabel : null, measure: null, fill: 0, text: result.headline.value, change: overall.delta, tone: overall.tone, exception: true, valued: true },
    rows,
    verdict: boardVerdict({ unit: input.unit, labels: rows.map((row) => row.label), changes, notable, format, slice: input.capped ? TH.read.shown(rows.length, input.unit) : null }),
    hero: { label: input.scope, value: result.headline.value, unit: null, ...overall, detail: result.headline.compareLabel },
    lead: null,
    pickWhenNone: LEADERS,
    fold: foldLine(input.unit, () => null, measuresOf, (value) => formatMetricValue(query.metric, value)),
  };
}

function medianOf(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length === 0 ? 0 : ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];
}

function referenceReading(input: BreakdownInput): Breakdown {
  const { query, result } = input;
  const values = input.rows.map((row) => numericOf(row, "value"));
  const known = values.filter((value): value is number => value !== null);
  const overallLevel = metricFormat(query.metric) === "percent" ? percentIn(result.headline.value) : null;
  const baseline = overallLevel ?? medianOf(known);
  const peak = Math.max(...known.map(Math.abs), 0);
  const outliers = outliersOf(values, peak * REFERENCE_GAP_SHARE);
  const ends = outliers.size > 0 || known.length < 2 ? new Set<number>() : new Set([values.indexOf(Math.max(...known)), values.lastIndexOf(Math.min(...known))]);
  const rows: ReadRow[] = input.rows.map((row, index) => {
    const value = values[index];
    const exception = outliers.has(index) || ends.has(index);
    return {
      label: labelOf(query, row),
      sub: null,
      measure: value,
      fill: peak === 0 || value === null ? 0 : Math.abs(value) / peak,
      text: valueTextOf(query, row),
      change: null,
      tone: outliers.has(index) && value !== null ? toneOf(query.metric, value > baseline ? PERCENT : -PERCENT) : "neutral",
      exception,
      valued: exception || index === 0 || index === input.rows.length - 1,
    };
  });
  const overall = headlineMove(query, result);
  const format = (value: number) => formatMetricValue(query.metric, value);
  return {
    form: "line",
    baseline,
    overall: { label: input.scope, sub: overall.delta ? result.headline.compareLabel : null, measure: null, fill: 0, text: result.headline.value, change: overall.delta, tone: overall.tone, exception: true, valued: true },
    rows,
    verdict: referenceVerdict({ unit: input.unit, labels: rows.map((row) => row.label), values, texts: rows.map((row) => row.text), outliers }),
    hero: { label: input.scope, value: result.headline.value, unit: null, ...overall, detail: result.headline.compareLabel },
    lead: null,
    pickWhenNone: 0,
    fold: foldLine(input.unit, () => null, measuresOf, format),
  };
}

/** R10 parity in the B anatomy: one thing measured twice (sell-out against sell-in) read as the second over the first around the 100% line, the things falling well short drawn thick with their share, the rest thin and muted; the overall share on top. */
export function parityReading(input: { gaps: readonly ParityGap[]; hero: CardHero; verdict: string; unit: string }): Breakdown {
  const { gaps, hero } = input;
  const rows: ReadRow[] = gaps.map((gap, index) => ({
    label: gap.label,
    sub: null,
    measure: gap.ratio,
    fill: Math.min(1, Math.max(0, gap.ratio / PERCENT)),
    text: percentText(gap.ratio),
    change: null,
    tone: gap.short ? "bad" : "neutral",
    exception: gap.short,
    valued: gap.short || index === gaps.length - 1,
  }));
  const overallMeasure = percentIn(hero.value);
  return {
    form: "line",
    baseline: PERCENT,
    overall: { label: TH.read.allOf(input.unit), sub: hero.label, measure: overallMeasure, fill: 0, text: hero.value, change: null, tone: hero.tone, exception: true, valued: true },
    rows,
    verdict: input.verdict,
    hero,
    lead: null,
    pickWhenNone: 0,
    fold: foldLine(input.unit, () => null, measuresOf, percentText),
  };
}

/** Reads one breakdown the way styles B and A draw it, by the bars the decision table chose. */
export function readBreakdown(input: BreakdownInput): Breakdown {
  const reading = readByBars(input);
  return input.asked.size === 0 ? reading : withAskedRows(reading, input);
}

function readByBars(input: BreakdownInput): Breakdown {
  if (input.bars === "change") return changeReading(input);
  if (input.bars === "board") return boardReading(input);
  if (input.bars === "reference") return referenceReading(input);
  const line = input.bars === "target" ? TARGET_LINE : (LEVEL_LINES[input.query.metric] ?? TARGET_LINE);
  return lineReading(input, line);
}

/** The second line of a row the question named: its value against target, or its change against the window it is compared with ("+0.6 จุด เทียบช่วงก่อนหน้า"). */
function askedSubOf(query: MetricQuery, result: OkResult, row: MetricRow): string | null {
  if (query.compare === "target") return targetSubOf(query, row);
  const change = changeTextOf(query.metric, row);
  return change ? [change, result.headline.compareLabel].filter(Boolean).join(" ") : null;
}

/** The verdict about the one row the question named: its share of target, its change, or its level. */
function askedVerdictOf(query: MetricQuery, result: OkResult, row: MetricRow): string {
  const move = rowMove(query, row);
  const inPoints = metricFormat(query.metric) === "percent";
  return summaryVerdict({
    label: labelOf(query, row),
    attainment: query.compare === "target" ? attainmentOf(row) : null,
    change: inPoints ? deltaPointsOf(row) : deltaPercentOf(row),
    changeText: move.delta,
    flat: move.trend === "neutral",
    versus: result.headline.compareLabel ?? "",
    value: valueTextOf(query, row),
  });
}

/** A breakdown whose question named rows ("มาร์จินกลุ่มเบียร์"): those rows are drawn as exceptions with their value and change, and one named row leads the verdict and style A's hero, so the card shows what was asked even when it is not an extreme. */
function withAskedRows(reading: Breakdown, input: BreakdownInput): Breakdown {
  const { query, result, asked } = input;
  const named = new Map(input.rows.flatMap((row) => (asked.has(labelOf(query, row)) ? [[labelOf(query, row), row] as const] : [])));
  if (named.size === 0) return reading;
  const rows = reading.rows.map((row) => {
    const source = named.get(row.label);
    return source ? { ...row, exception: true, valued: true, sub: row.sub ?? askedSubOf(query, result, source) } : row;
  });
  const [only] = named.size === 1 ? [...named.values()] : [];
  if (!only) return { ...reading, rows };
  const label = labelOf(query, only);
  const hero: CardHero = { label, value: valueTextOf(query, only), unit: null, ...rowMove(query, only), detail: baseOf(query, only) ?? result.headline.compareLabel };
  const verdict = askedVerdictOf(query, result, only);
  const top = rows.find((row) => row.label === label);
  if (!reading.overall || !top) return { ...reading, rows, verdict, lead: { row: label, hero } };
  const overall: ReadRow = { ...top, sub: joinedText([top.sub, overallLine(reading.overall)]) };
  return { ...reading, overall, rows: rows.filter((row) => row !== top), verdict, hero, lead: { row: label, hero } };
}

/** The overall row in one line under the named row that took its place on top ("เฉลี่ยทุกกลุ่มธุรกิจ 27.3% +0.8 จุด"). */
function overallLine(row: ReadRow): string {
  return [row.label, row.text, row.change].filter(Boolean).join(" ");
}

function scaleOf(form: StripForm, baseline: number, measures: number[]): { low: number; high: number } {
  const all = form === "board" ? [0, ...measures] : [baseline, ...measures];
  const low = Math.min(...all);
  const high = Math.max(...all);
  const pad = (high - low) * SCALE_PAD || 1;
  return { low: form === "board" && low === 0 ? 0 : low - pad, high: high + pad };
}

/** Whether a breakdown is drawn whole (style B) or as its exceptions with the rest folded (style A). */
export function fitsOneStrip(reading: Breakdown): boolean {
  return reading.rows.length <= MAX_STRIP_ROWS;
}

/** Style B: every row on one shared scale around the deciding line (or from zero), the overall row on top. */
export function stripOf(reading: Breakdown): Strip {
  const measures = measuresOf(reading.overall ? [reading.overall, ...reading.rows] : reading.rows);
  return { form: reading.form, baseline: reading.baseline, ...scaleOf(reading.form, reading.baseline, measures), overall: reading.overall, rows: reading.rows };
}

/** Style A: only the exception rows drawn (the leaders of a board when nothing stands out), the row the hero already names left out, the rest folded into one line. */
export function exceptionsOf(reading: Breakdown): { strip: Strip; fold: Fold | null } {
  const picked = reading.rows.filter((row) => row.exception);
  const shown = picked.length > 0 ? picked : reading.rows.slice(0, reading.pickWhenNone);
  const drawn = shown.filter((row) => row.label !== reading.lead?.row);
  const rest = reading.rows.filter((row) => !shown.includes(row));
  const strip = { form: reading.form, baseline: reading.baseline, ...scaleOf(reading.form, reading.baseline, measuresOf(drawn)), overall: null, rows: drawn };
  return { strip, fold: rest.length === 0 ? null : { line: reading.fold(rest, drawn.length + (reading.lead ? 1 : 0)), rows: rest } };
}
