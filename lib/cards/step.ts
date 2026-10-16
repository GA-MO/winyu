/** A series that moved from one flat level to another: the index of the first bucket at the later level and the mean level on each side. */
export type Step = { at: number; before: number; after: number };

const MIN_SIDE = 3;
const MIN_SHIFT = 0.4;
const MIN_FIT = 0.5;

function meanOf(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function spreadOf(values: readonly number[]): number {
  const mean = meanOf(values);
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
}

/** The one break that best splits a series into two levels, or null when there is none worth leading with: each side holds at least 3 buckets, the later level is at least 40% away from the earlier, and the two levels explain at least half of the series' spread. */
export function stepOf(values: readonly number[]): Step | null {
  if (values.length < MIN_SIDE * 2) return null;
  const total = spreadOf(values);
  if (total === 0) return null;
  const candidates = Array.from({ length: values.length - MIN_SIDE * 2 + 1 }, (_, offset) => {
    const at = MIN_SIDE + offset;
    const [earlier, later] = [values.slice(0, at), values.slice(at)];
    return { at, before: meanOf(earlier), after: meanOf(later), fit: 1 - (spreadOf(earlier) + spreadOf(later)) / total };
  });
  const best = candidates.reduce((winner, candidate) => (candidate.fit > winner.fit ? candidate : winner));
  if (best.fit < MIN_FIT || best.before === 0 || Math.abs(best.after - best.before) / Math.abs(best.before) < MIN_SHIFT) return null;
  return { at: best.at, before: best.before, after: best.after };
}
