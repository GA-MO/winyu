const TOP_CONTRIBUTORS = 5;
const PERCENT_DIGITS = 1;
const DOMINANT_SHARE = 0.2;
const CLEAR_LEAD = 1.25;
const MOST_OF_GAP = 0.5;
const HARDER = 1.5;

export type GapPart = { label: string; value: number; compare: number };
export type Contribution = { label: string; gap: number; share: number };
export type GapBreakdown = { gap: number; contributors: Contribution[]; rest: Contribution | null; offsetting: Contribution[] };
export type RunRate = { actual: number; targetSoFar: number; elapsedDays: number; monthDays: number; recentDailyAverage: number };
export type Projection = { projected: number; monthTarget: number; attainment: number; remaining: number; attainmentToDate: number };

function gapOf(part: GapPart): number {
  return part.value - part.compare;
}

function sameSign(left: number, right: number): boolean {
  return left !== 0 && Math.sign(left) === Math.sign(right);
}

/** Who made the gap between actual and target (or a prior period): each part's own gap and its share of the total, the biggest first. */
export function breakDownGap(total: GapPart, parts: readonly GapPart[]): GapBreakdown {
  const gap = gapOf(total);
  const withGap = parts.map((part) => ({ label: part.label, gap: gapOf(part) }));
  const drivers = withGap.filter((part) => sameSign(part.gap, gap)).sort((left, right) => Math.abs(right.gap) - Math.abs(left.gap));
  const share = (partGap: number) => (gap === 0 ? 0 : partGap / gap);
  const contributors = drivers.slice(0, TOP_CONTRIBUTORS).map((part) => ({ ...part, share: share(part.gap) }));
  const restGap = drivers.slice(TOP_CONTRIBUTORS).reduce((sum, part) => sum + part.gap, 0);
  const offsetting = withGap.filter((part) => part.gap !== 0 && !sameSign(part.gap, gap)).sort((left, right) => Math.abs(right.gap) - Math.abs(left.gap)).slice(0, TOP_CONTRIBUTORS).map((part) => ({ ...part, share: share(part.gap) }));
  return { gap, contributors, rest: restGap === 0 ? null : { label: "", gap: restGap, share: share(restGap) }, offsetting };
}

/** Whether a part explains enough of a gap (a fifth, as a fraction) to be named its main cause. */
export function standsOut(share: number): boolean {
  return Math.abs(share) >= DOMINANT_SHARE;
}

/** The biggest part of a gap and every part about its size (within a quarter of it), biggest first. */
export function leadingParts<Part extends { share: number }>(contributors: readonly Part[]): Part[] {
  const [biggest] = contributors;
  return biggest ? contributors.filter((part) => part.share * CLEAR_LEAD >= biggest.share) : [];
}

/** The parts that are a gap's main cause, biggest first: the biggest alone when it explains a fifth of the gap and clearly more than the next; the leading parts about its size together when each explains a fifth and together they make most of the gap; none when the gap is spread, so two parts a hair apart are never told as one main cause and its runner-up (AI-214). */
export function mainCauses<Part extends { share: number }>(contributors: readonly Part[]): Part[] {
  const [biggest] = contributors;
  if (!biggest || !standsOut(biggest.share)) return [];
  const leaders = leadingParts(contributors);
  if (leaders.length === 1) return leaders;
  const together = leaders.reduce((sum, part) => sum + part.share, 0);
  return leaders.every((part) => standsOut(part.share)) && together >= MOST_OF_GAP ? leaders : [];
}

function changeOf(part: GapPart): number {
  return part.compare === 0 ? 0 : gapOf(part) / part.compare;
}

/** The parts that moved harder than the whole, biggest gap first: each made a fifth of the gap and moved at least half again as much as the whole in percent, so a drop every part shares in proportion to its size names none (AI-214). */
export function fellHarder(whole: GapPart, parts: readonly GapPart[]): GapPart[] {
  const gap = gapOf(whole);
  const change = changeOf(whole);
  if (gap === 0 || change === 0) return [];
  return parts
    .filter((part) => sameSign(gapOf(part), gap) && standsOut(gapOf(part) / gap) && changeOf(part) / change >= HARDER)
    .sort((left, right) => Math.abs(gapOf(right)) - Math.abs(gapOf(left)));
}

/** Whether the gap is spread wide: no part that made it explains a fifth of it, so none is its main cause. */
export function isBroad(breakdown: GapBreakdown): boolean {
  const [biggest] = breakdown.contributors;
  return biggest !== undefined && !standsOut(biggest.share);
}

/** Where the month ends if the rest of it sells at the recent daily pace, against a target spread evenly over the month's days; also how much of the whole month's target is done so far and what is left to reach it. */
export function projectMonthEnd(rate: RunRate): Projection | null {
  if (rate.elapsedDays <= 0 || rate.targetSoFar <= 0 || rate.monthDays < rate.elapsedDays) return null;
  const projected = rate.actual + rate.recentDailyAverage * (rate.monthDays - rate.elapsedDays);
  const monthTarget = (rate.targetSoFar / rate.elapsedDays) * rate.monthDays;
  return { projected, monthTarget, attainment: (projected / monthTarget) * 100, remaining: Math.max(0, monthTarget - rate.actual), attainmentToDate: (rate.actual / monthTarget) * 100 };
}

/** A share as a card prints it: "53.4%". */
export function formatShare(share: number): string {
  return `${(share * 100).toFixed(PERCENT_DIGITS)}%`;
}
