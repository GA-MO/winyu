import type { NextAction } from "@/lib/contracts";
import type { MetricAnswer } from "@/lib/cards/tool-answers";
import { formatDelta } from "@/lib/dashboard/metric-display";
import { formatDateTh, formatPercent } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { COPY } from "./copy";

const TARGET_LINE = 100;
const SPLIT_GAP_POINTS = 10;
const NEAR_HALF = 40;
const HALF = 50;
const WHOLE = 100;

export type Tone = "bad" | "good" | "neutral";
export type ReadingKind = "attainment" | "change";

/** One row as the variants draw it: the measure is % of target or % change, the value is the tool's own label. */
export type ReadRow = { label: string; measure: number; measureText: string; valueText: string; exception: boolean };

export type Tile = { label: string; value: string; sub: string; named: boolean; tone: Tone };

/** Everything a variant needs, derived from one query_metric result so the same functions work for other data. */
export type Reading = {
  kind: ReadingKind;
  unit: string;
  verdict: string;
  hero: { label: string; value: string; suffix: string | null; delta: string | null; deltaTone: Tone; detail: string | null; row: ReadRow | null };
  overall: { label: string; measure: number; text: string; tone: Tone };
  baseline: number;
  rows: ReadRow[];
  exceptions: ReadRow[];
  rest: ReadRow[];
  restLine: string | null;
  tiles: Tile[];
  expandLabel: string;
  primary: NextAction | null;
  footer: string;
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function percentText(value: number): string {
  return formatPercent(round1(value));
}

function rangeText(values: number[], format: (value: number) => string): string {
  const low = Math.min(...values);
  const high = Math.max(...values);
  return low === high ? format(low) : `${format(low).replace("%", "")}–${format(high)}`;
}

function scopeLabel(answer: MetricAnswer, unit: string): string {
  const noFilters = Object.keys(answer.query.filters).length === 0 && Object.keys(answer.query.scopeApplied ?? {}).length === 0;
  return answer.query.dims[0] === "region" && noFilters ? COPY.nationwide : COPY.allOf(unit);
}

function compactPeriod(from: string, to: string): string {
  const [fromYear, fromMonth, fromDay] = from.split("-");
  const [toYear, toMonth] = to.split("-");
  if (fromYear === toYear && fromMonth === toMonth) return `${Number(fromDay)}–${formatDateTh(to)}`;
  return `${formatDateTh(from)} – ${formatDateTh(to)}`;
}

function footerOf(answer: MetricAnswer): string {
  return `${compactPeriod(answer.query.range.from, answer.query.range.to)} · ${answer.provenance.sourceSystem}`;
}

function rowsOf(answer: MetricAnswer, kind: ReadingKind): Omit<ReadRow, "exception">[] {
  const dim = answer.query.dims[0];
  return answer.rows.map((row) => {
    const delta = Number(row.delta_pct ?? 0);
    const measure = kind === "attainment" ? round1(TARGET_LINE + delta) : round1(delta);
    return {
      label: String(row[dim] ?? ""),
      measure,
      measureText: kind === "attainment" ? percentText(measure) : formatDelta(measure) ?? "",
      valueText: String(row.value_label ?? ""),
    };
  });
}

function splitAtLargestGap(measures: number[]): number {
  if (measures.length < 2) return measures.length;
  let at = 0;
  let widest = 0;
  for (let index = 0; index < measures.length - 1; index += 1) {
    const gap = Math.abs(measures[index] - measures[index + 1]);
    if (gap > widest) {
      widest = gap;
      at = index;
    }
  }
  const leading = at + 1;
  return widest >= SPLIT_GAP_POINTS && leading <= Math.ceil(measures.length / 2) ? leading : 1;
}

function magnitudePhrase(size: number, several: boolean): string {
  if (size >= NEAR_HALF && size < HALF) return COPY.nearHalf;
  if (size >= HALF && size < WHOLE) return COPY.overHalf;
  return several ? COPY.over(percentText(Math.floor(size))) : percentText(size);
}

function attainmentReading(answer: MetricAnswer): Reading {
  const unit = TH.dim[answer.query.dims[0]] ?? "";
  const base = rowsOf(answer, "attainment");
  const rows = base.map((row) => ({ ...row, exception: row.measure < TARGET_LINE }));
  const exceptions = rows.filter((row) => row.exception).sort((a, b) => a.measure - b.measure);
  const rest = rows.filter((row) => !row.exception);
  const overallMeasure = round1(TARGET_LINE + (answer.headline.deltaPercent ?? 0));
  const overallTone: Tone = overallMeasure < TARGET_LINE ? "bad" : "neutral";
  const scope = scopeLabel(answer, unit);
  const total = answer.headline.underLine?.of ?? rows.length;
  const worst = exceptions[0] ?? null;
  return {
    kind: "attainment",
    unit,
    verdict: attainmentVerdict(exceptions, unit, overallMeasure),
    hero: { label: scope, value: percentText(overallMeasure), suffix: COPY.ofTarget, delta: formatDelta(answer.headline.deltaPercent), deltaTone: overallTone, detail: answer.headline.value, row: null },
    overall: { label: scope, measure: overallMeasure, text: percentText(overallMeasure), tone: overallTone },
    baseline: TARGET_LINE,
    rows,
    exceptions,
    rest,
    restLine: rest.length === 0 ? null : COPY.restAboveTarget(rest.length, unit, rangeText(rest.map((row) => row.measure), percentText)),
    tiles: [
      { label: scope, value: percentText(overallMeasure), sub: COPY.ofTarget, named: false, tone: overallTone },
      { label: COPY.belowTarget, value: `${exceptions.length}/${total}`, sub: unit, named: false, tone: exceptions.length > 0 ? "bad" : "neutral" },
      worst
        ? { label: COPY.lowest, value: worst.measureText, sub: worst.label, named: true, tone: "bad" }
        : { label: COPY.lowest, value: rows[rows.length - 1]?.measureText ?? "", sub: rows[rows.length - 1]?.label ?? "", named: true, tone: "neutral" },
    ],
    expandLabel: COPY.seeAll(unit),
    primary: answer.nextActions[0] ?? null,
    footer: footerOf(answer),
  };
}

function attainmentVerdict(exceptions: ReadRow[], unit: string, overall: number): string {
  if (exceptions.length === 0) return COPY.allMetTarget(unit);
  if (exceptions.length === 1 && overall < TARGET_LINE) return COPY.missedBecauseOne(exceptions[0].label, unit);
  if (exceptions.length === 1) return COPY.onlyOneBelow(exceptions[0].label, unit);
  return COPY.severalBelow(exceptions.length, unit, exceptions[0].label);
}

function changeReading(answer: MetricAnswer): Reading {
  const unit = TH.dim[answer.query.dims[0]] ?? "";
  const base = rowsOf(answer, "change");
  const leading = splitAtLargestGap(base.map((row) => row.measure));
  const rows = base.map((row, index) => ({ ...row, exception: index < leading }));
  const exceptions = rows.filter((row) => row.exception);
  const rest = rows.filter((row) => !row.exception);
  const falling = (exceptions[0]?.measure ?? 0) < 0;
  const mildest = Math.min(...exceptions.map((row) => Math.abs(row.measure)));
  const phrase = magnitudePhrase(mildest, exceptions.length > 1);
  const verb = falling ? COPY.fell : COPY.rose;
  const overallDelta = round1(answer.headline.deltaPercent ?? 0);
  const overallTone: Tone = overallDelta < 0 ? "bad" : overallDelta > 0 ? "good" : "neutral";
  const scope = COPY.allOf(unit);
  const worst = exceptions[0];
  const rowTone: Tone = falling ? "bad" : "good";
  return {
    kind: "change",
    unit,
    verdict: exceptions.length === 1 ? COPY.oneMoved(worst.label, verb, phrase) : COPY.severalMoved(exceptions.length, unit, verb, phrase),
    hero: { label: worst.label, value: worst.valueText, suffix: null, delta: worst.measureText, deltaTone: rowTone, detail: null, row: worst },
    overall: { label: scope, measure: overallDelta, text: formatDelta(overallDelta) ?? "", tone: overallTone },
    baseline: 0,
    rows,
    exceptions,
    rest,
    restLine: rest.length === 0 ? null : COPY.restMoved(rest.length, unit, falling ? COPY.down : COPY.up, rangeText(rest.map((row) => Math.abs(row.measure)), percentText)),
    tiles: [
      { label: scope, value: formatDelta(overallDelta) ?? "", sub: answer.headline.compareLabel ?? "", named: false, tone: overallTone },
      { label: `${verb}${phrase}`, value: String(exceptions.length), sub: unit, named: false, tone: rowTone },
      { label: falling ? COPY.fellMost : COPY.roseMost, value: worst.measureText, sub: worst.label, named: true, tone: rowTone },
    ],
    expandLabel: COPY.seeAllCount(rows.length, unit),
    primary: answer.nextActions[0] ?? null,
    footer: footerOf(answer),
  };
}

/** Reads a query_metric answer the way the three variants need it; target comparisons read as % of target, everything else as change. */
export function readingOf(answer: MetricAnswer): Reading {
  return answer.query.compare === "target" ? attainmentReading(answer) : changeReading(answer);
}
