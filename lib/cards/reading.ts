import type { Tone } from "@/lib/dashboard/metric-display";
import { formatDateTh, formatPercent } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";

const SPREAD_SHARE = 0.3;
const NEAR_HALF = 40;
const HALF = 50;
const WHOLE = 100;
const MIN_OUTLIER_ROWS = 3;
const THAI_THEN_LATIN = /([\u0E01-\u0E5B])([A-Za-z0-9])/g;
const LATIN_THEN_THAI = /([A-Za-z0-9%])([\u0E01-\u0E30\u0E32\u0E33\u0E3F-\u0E46\u0E4F-\u0E5B])/g;

/** One row of a breakdown as styles B and A draw it: where it sits on the shared scale (and how full style A's own bar is), the text beside it, the change pill a leaderboard row carries, a second line under the name, and whether it is an exception the verdict is about. */
export type ReadRow = {
  label: string;
  sub: string | null;
  measure: number | null;
  fill: number;
  text: string;
  change: string | null;
  tone: Tone;
  exception: boolean;
  valued: boolean;
};

/** How a strip draws its bars: from a deciding line (target, low cover, zero change, a reference level) or from zero as a leaderboard. */
export type StripForm = "line" | "board";

/** Style B's one strip of bars on a shared scale, the overall row on top (null when the verdict already carries the count). */
export type Strip = { form: StripForm; baseline: number; low: number; high: number; overall: ReadRow | null; rows: ReadRow[] };

/** Style A's folded rows: one muted line that expands to the rows themselves. */
export type Fold = { line: string; rows: ReadRow[] };

/** One fact of a style C scorecard. */
export type Tile = { label: string; value: string; delta: string | null; tone: Tone; sub: string | null };

/** The card's closing line (date span, what the question was narrowed to, source) and the provenance it folds away (trust, as-of, coverage, masking, compare notes). */
export type CardFooter = { line: string; verified: boolean; details: string | null };

/** A sentence put together from Thai words, names and numbers, with a space wherever Thai meets a Latin word or a number ("ต่ำสุด DC เชียงใหม่", "ลดลง 6.7 จุด"), the way Thai writes them. */
export function spaced(text: string): string {
  return text.replace(THAI_THEN_LATIN, "$1 $2").replace(LATIN_THEN_THAI, "$1 $2");
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** A percent with one decimal at most: "48.6%". */
export function percentText(value: number): string {
  return formatPercent(round1(value));
}

/** How many rows at the leading end of an ordered list stand clear of the rest: the widest step between neighbours within the first half, when it is at least `minGap` and a clear share of the whole spread; 0 when no step stands out, 1 for a list of one. */
export function leadingExceptions(measures: readonly number[], minGap: number): number {
  if (measures.length <= 1) return measures.length;
  const limit = Math.min(Math.ceil(measures.length / 2), measures.length - 1);
  let at = 0;
  let widest = 0;
  for (let index = 0; index < limit; index += 1) {
    const step = Math.abs(measures[index] - measures[index + 1]);
    if (step > widest) {
      widest = step;
      at = index + 1;
    }
  }
  const spread = Math.abs(measures[0] - measures[measures.length - 1]);
  return widest >= minGap && widest >= spread * SPREAD_SHARE ? at : 0;
}

/** Which values stand apart from the rest on either side: the widest step in the sorted values splits off the smaller side (fewer than half the rows) when it is at least `minGap` and a clear share of the spread; empty when nothing stands apart or there are fewer than three values. */
export function outliersOf(values: readonly (number | null)[], minGap: number): Set<number> {
  const known = values.flatMap((value, index) => (value === null ? [] : [{ value, index }])).sort((left, right) => left.value - right.value);
  if (known.length < MIN_OUTLIER_ROWS) return new Set();
  const most = Math.floor((known.length - 1) / 2);
  let best: { at: number; step: number } | null = null;
  for (let at = 1; at < known.length; at += 1) {
    const smaller = Math.min(at, known.length - at);
    const step = known[at].value - known[at - 1].value;
    if (smaller <= most && (best === null || step > best.step)) best = { at, step };
  }
  const spread = known[known.length - 1].value - known[0].value;
  if (!best || best.step < minGap || best.step < spread * SPREAD_SHARE) return new Set();
  const side = best.at <= known.length - best.at ? known.slice(0, best.at) : known.slice(best.at);
  return new Set(side.map((entry) => entry.index));
}

/** "10.8–12.9%" from a list of values, or the one value when they are all the same. */
export function rangeText(values: readonly number[], format: (value: number) => string): string {
  const low = Math.min(...values);
  const high = Math.max(...values);
  if (round1(low) === round1(high)) return format(low);
  const lowText = format(low);
  const highText = format(high);
  if (low < 0) return TH.read.between(lowText, highText);
  const suffix = /[^0-9.,]+$/.exec(highText)?.[0] ?? "";
  return suffix !== "" && lowText.endsWith(suffix) ? `${lowText.slice(0, -suffix.length).trimEnd()}–${highText}` : `${lowText}–${highText}`;
}

function floorText(size: number, unit: "percent" | "points"): string {
  const floored = size >= 1 ? Math.floor(size) : Math.floor(size * 10) / 10;
  return unit === "points" ? TH.read.points(floored) : formatPercent(floored);
}

/** How big a move reads in words: "เกือบครึ่ง", "เกินครึ่ง", "กว่าเท่าตัว" for relative changes, else the size itself ("กว่า 12%" for several rows, the exact size for one). */
export function magnitudeWords(size: number, several: boolean, unit: "percent" | "points"): string {
  if (unit === "percent" && size >= WHOLE) return TH.read.overDouble;
  if (unit === "percent" && size >= HALF) return TH.read.overHalf;
  if (unit === "percent" && size >= NEAR_HALF) return TH.read.nearHalf;
  if (several) return TH.read.over(floorText(size, unit));
  return unit === "points" ? TH.read.points(round1(size)) : percentText(size);
}

function compactSpan(start: string, end: string): string {
  if (start === end) return end;
  const [startDay, startMonth, startYear] = start.split(" ");
  const [, endMonth, endYear] = end.split(" ");
  if (!startYear || startYear !== endYear) return `${start} – ${end}`;
  if (startMonth === endMonth) return `${startDay}–${end}`;
  return `${startDay} ${startMonth} – ${end}`;
}

/** The date span of a card in one short piece: "1–22 ก.ย. 2569", "1 ส.ค. – 22 ก.ย. 2569", or one day. */
export function spanText(from: string, to: string): string {
  return compactSpan(formatDateTh(from), formatDateTh(to));
}

/** A period label the engine wrote ("1 ก.ย. 2569 – 22 ก.ย. 2569") in the same short form; a label it cannot split stays as it is. */
export function compactPeriod(label: string): string {
  const [start, end, ...rest] = label.split(" – ");
  return end && rest.length === 0 ? compactSpan(start, end) : label;
}

/** Which deciding line a level breakdown is read against. */
export type LineKind = { kind: "target" } | { kind: "cover"; days: number };

/** R3 and R6: how many groups sit on the wrong side of the line out of every group in scope, the worst of them, whether the overall level is under the line too, and the weakest row when nothing is under. */
export type LineVerdictInput = { line: LineKind; unit: string; count: number; of: number; worst: string | null; overallUnder: boolean; sums: boolean; weakest: { label: string; text: string } | null };

/** The verdict of a breakdown read against a target or the low-cover line: who sits under it, or that nobody does. */
export function lineVerdict(input: LineVerdictInput): string {
  const { line, unit, count, of, worst } = input;
  if (line.kind === "target") {
    if (count === 0 || !worst) return TH.read.target.none(unit);
    if (count === of && of > 1) return TH.read.target.all(unit, worst);
    if (count === 1) return input.overallUnder ? TH.read.target.oneSinks(worst, unit, input.sums) : TH.read.target.one(worst, unit);
    return TH.read.target.some(count, unit, worst);
  }
  if (count === 0 || !worst) return input.weakest ? TH.read.cover.none(unit, line.days, input.weakest.label, input.weakest.text) : TH.read.every(unit);
  if (count === of && of > 1) return TH.read.cover.all(unit, line.days, worst);
  if (count === 1) return TH.read.cover.one(worst, line.days);
  return TH.read.cover.some(count, unit, line.days, worst);
}

/** R7: how many of every group in scope meet the threshold the question set. */
export function thresholdVerdict(count: number, of: number, unit: string, what: string): string {
  return TH.read.countOf(count, of, unit, what);
}

/** R4: a list ranked by change, its leading exceptions (the size of each move, as positive numbers), and every row's signed change. */
export type ChangeVerdictInput = { unit: string; falling: boolean; sums: boolean; inPoints: boolean; leading: readonly { label: string; size: number }[]; changes: readonly number[]; format: (value: number) => string };

function directionWord(change: number): string {
  return change < 0 ? TH.read.fell : TH.read.rose;
}

/** The verdict of a change ranking: the one or few rows that moved clear of the rest and by how much in words, else that nothing stands out or every row moved alike. */
export function changeVerdict(input: ChangeVerdictInput): string {
  const verb = input.sums ? (input.falling ? TH.read.lost : TH.read.gained) : input.falling ? TH.read.fell : TH.read.rose;
  const first = input.changes[0] ?? 0;
  if (input.falling ? first >= 0 : first <= 0) return TH.read.noneMoved(input.unit, input.falling ? TH.read.fell : TH.read.rose);
  if (input.leading.length === 0) {
    const sameWay = input.changes.every((change) => (input.falling ? change < 0 : change > 0));
    if (!sameWay) return TH.read.noneStandsOut(input.unit, verb);
    return TH.read.allClose(TH.read.every(input.unit), input.falling ? TH.read.fell : TH.read.rose, rangeText(input.changes.map(Math.abs), input.format));
  }
  const mildest = Math.min(...input.leading.map((row) => row.size));
  const size = magnitudeWords(mildest, input.leading.length > 1, input.inPoints ? "points" : "percent");
  if (input.leading.length === 1) return TH.read.oneMoved(input.leading[0].label, verb, size);
  return TH.read.someMoved(input.leading.length, input.unit, verb, size);
}

/** A leaderboard: labels by size, every row's signed change, the rows whose change stands out (by index), and how a change size is written. */
export type BoardVerdictInput = { unit: string; labels: readonly string[]; changes: readonly (number | null)[]; notable: ReadonlySet<number>; format: (value: number) => string };

function medianOf(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];
}

/** How a change stands against the usual change of the other rows: the same way but bigger, the same way but smaller, or the other way. */
export function relationOf(change: number, usual: number): keyof typeof TH.read.relation {
  if (usual !== 0 && Math.sign(change) !== Math.sign(usual)) return "against";
  return Math.abs(change) >= Math.abs(usual) ? "more" : "less";
}

/** The verdict of a leaderboard: the rows whose change stands apart and whether they moved more, less or against the rest, else who leads and whether every row moved alike. */
export function boardVerdict(input: BoardVerdictInput): string {
  const known = input.changes.flatMap((change, index) => (change === null ? [] : [{ change, index }]));
  const notable = known.filter((entry) => input.notable.has(entry.index));
  const others = known.filter((entry) => !input.notable.has(entry.index)).map((entry) => entry.change);
  const usual = others.length > 0 ? medianOf(others) : 0;
  const [lead] = [...notable].sort((left, right) => Math.abs(right.change - usual) - Math.abs(left.change - usual));
  if (lead) {
    const relation = TH.read.relation[relationOf(lead.change, usual)];
    const verb = directionWord(lead.change);
    if (notable.length === 1) return TH.read.boardOne(input.labels[lead.index], verb, input.format(Math.abs(lead.change)), relation, input.unit);
    const [first, second] = notable;
    if (notable.length === 2) return TH.read.boardTwo(input.labels[first.index], input.labels[second.index], verb, relation, input.unit);
    return TH.read.boardSome(notable.length, input.unit, verb, relation);
  }
  const [leader = "", next] = input.labels;
  const changes = known.map((entry) => entry.change);
  const sameWay = changes.length === input.labels.length && changes.length > 1 && (changes.every((change) => change < 0) || changes.every((change) => change > 0));
  if (sameWay) return TH.read.boardLeaderClose(leader, TH.read.every(input.unit), directionWord(changes[0]));
  return next ? TH.read.boardLeader(leader, next) : leader;
}

/** The verdict of a donut: the largest part, said as more than half when it is, else who follows it. */
export function shareVerdict(labels: readonly string[], leaderShare: number): string {
  const [leader = "", next] = labels;
  if (leaderShare > HALF / WHOLE) return TH.read.shareHalf(leader);
  return next ? TH.read.shareLead(leader, next) : leader;
}

/** A level ranking of a rate or an average: labels, values and the values as written, by rank, and the rows that stand apart (by index). */
export type ReferenceVerdictInput = { unit: string; labels: readonly string[]; values: readonly (number | null)[]; texts: readonly string[]; outliers: ReadonlySet<number> };

/** The verdict of a level ranking read against its centre: the row or rows that sit clear above or below the rest, else the highest and the lowest with their values. */
export function referenceVerdict(input: ReferenceVerdictInput): string {
  const known = input.values.flatMap((value, index) => (value === null ? [] : [{ index, value }]));
  const picked = known.filter((entry) => input.outliers.has(entry.index));
  if (picked.length === 0) {
    const ranked = [...known].sort((left, right) => right.value - left.value);
    const top = ranked[0];
    const bottom = ranked[ranked.length - 1];
    if (!top || !bottom || top === bottom) return top ? TH.read.level(input.labels[top.index], input.texts[top.index]) : "";
    return TH.read.referenceSpread(input.labels[top.index], input.texts[top.index], input.labels[bottom.index], input.texts[bottom.index]);
  }
  const rest = known.filter((entry) => !input.outliers.has(entry.index)).map((entry) => entry.value);
  const above = rest.length === 0 || picked[0].value > medianOf(rest);
  const side = above ? TH.read.higher : TH.read.lower;
  const [lead] = [...picked].sort((left, right) => (above ? right.value - left.value : left.value - right.value));
  if (picked.length === 1) return TH.read.referenceOne(input.labels[lead.index], side, input.unit);
  return TH.read.referenceSome(picked.length, input.unit, side, input.labels[lead.index]);
}

/** One number about one scope (R1, R2, a total): the share of target when there is one, else its change against the compare window, else the level. */
export type SummaryVerdictInput = { label: string; attainment: number | null; change: number | null; changeText: string | null; flat: boolean; versus: string; value: string };

function unsigned(text: string): string {
  return text.replace(/^[+−-]/, "");
}

/** The verdict of a one-number card: met or short of target, moved or flat against the compare window, else the level. */
export function summaryVerdict(input: SummaryVerdictInput): string {
  if (input.attainment !== null) return input.attainment >= WHOLE ? TH.read.met(input.label) : TH.read.short(input.label, percentText(WHOLE - input.attainment));
  if (input.change === null || input.changeText === null) return TH.read.level(input.label, input.value);
  if (input.flat) return TH.read.flatAgainst(input.label, input.versus);
  return TH.read.moved(input.label, directionWord(input.change), unsigned(input.changeText), input.versus);
}

/** R9: the latest full bucket against the one before. */
export function trendVerdict(latest: string, previous: string, change: number, changeText: string, flat: boolean): string {
  if (flat) return TH.read.trendFlat(latest, previous);
  return TH.read.trend(latest, directionWord(change), unsigned(changeText), previous);
}
