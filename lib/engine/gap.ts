const TOP_CONTRIBUTORS = 5;
const PERCENT_DIGITS = 1;

export type GapPart = { label: string; value: number; compare: number };
export type Contribution = { label: string; gap: number; share: number };
export type GapBreakdown = { gap: number; contributors: Contribution[]; rest: Contribution | null; offsetting: Contribution[] };
export type RunRate = { actual: number; targetSoFar: number; elapsedDays: number; monthDays: number; recentDailyAverage: number };
export type Projection = { projected: number; monthTarget: number; attainment: number };

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

/** Where the month ends if the rest of it sells at the recent daily pace, against a target spread evenly over the month's days. */
export function projectMonthEnd(rate: RunRate): Projection | null {
  if (rate.elapsedDays <= 0 || rate.targetSoFar <= 0 || rate.monthDays < rate.elapsedDays) return null;
  const projected = rate.actual + rate.recentDailyAverage * (rate.monthDays - rate.elapsedDays);
  const monthTarget = (rate.targetSoFar / rate.elapsedDays) * rate.monthDays;
  return { projected, monthTarget, attainment: (projected / monthTarget) * 100 };
}

/** A share as a card prints it: "53.4%". */
export function formatShare(share: number): string {
  return `${(share * 100).toFixed(PERCENT_DIGITS)}%`;
}
