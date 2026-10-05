const SEASON_PERIOD = 7;
const SEASON_MIN_SAMPLES = 3;
const SIGMA_FLOOR_SHARE = 0.04;
const TREND_CLAMP = 0.45;
const TREND_DAMPING = 0.85;
const MAX_AUTOCORRELATION = 0.9;
const ONSET_TOLERANCE = 0.9;

export type ScanOptions = { tail: number; baseline: number; minBaseline: number; minWindow: number; maxLag: number; sigmaFloorShare?: number };

export const DAILY_SCAN: ScanOptions = { tail: 28, baseline: 56, minBaseline: 28, minWindow: 3, maxLag: 7 };
export const MONTHLY_SCAN: ScanOptions = { tail: 1, baseline: 4, minBaseline: 4, minWindow: 1, maxLag: 1 };
/** Monthly shares move a point or two, not a few percent: a longer baseline, a window of up to three months, a tighter noise floor. */
export const SHARE_SCAN: ScanOptions = { tail: 3, baseline: 6, minBaseline: 4, minWindow: 1, maxLag: 1, sigmaFloorShare: 0.008 };

export type Scan = {
  length: number;
  from: number;
  to: number;
  observed: number;
  expected: number;
  sigma: number;
  z: number;
  direction: "up" | "down";
};

export function mean(values: readonly number[], from = 0, to = values.length - 1): number {
  if (to < from) return 0;
  let sum = 0;
  for (let index = from; index <= to; index += 1) sum += values[index] as number;
  return sum / (to - from + 1);
}

export function stdev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  let sum = 0;
  for (const value of values) sum += (value - average) ** 2;
  return Math.sqrt(sum / (values.length - 1));
}

export function pearson(left: readonly number[], right: readonly number[]): number {
  const length = Math.min(left.length, right.length);
  if (length < 3) return 0;
  const leftMean = mean(left.slice(0, length));
  const rightMean = mean(right.slice(0, length));
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < length; index += 1) {
    const a = (left[index] as number) - leftMean;
    const b = (right[index] as number) - rightMean;
    covariance += a * b;
    leftVariance += a * a;
    rightVariance += b * b;
  }
  if (leftVariance === 0 || rightVariance === 0) return 0;
  return covariance / Math.sqrt(leftVariance * rightVariance);
}

function seasonFactors(values: readonly number[], season: readonly number[], from: number, to: number, level: number, skip: SkipMask): number[] {
  const sums = new Array<number>(SEASON_PERIOD).fill(0);
  const counts = new Array<number>(SEASON_PERIOD).fill(0);
  for (let index = from; index <= to; index += 1) {
    if (skip?.[index]) continue;
    const slot = season[index] as number;
    sums[slot] += values[index] as number;
    counts[slot] += 1;
  }
  return sums.map((sum, slot) => {
    if ((counts[slot] as number) < SEASON_MIN_SAMPLES || level <= 0) return 1;
    return sum / (counts[slot] as number) / level;
  });
}

type Line = { intercept: number; slope: number; to: number };

function fitLine(points: readonly number[], from: number, to: number): Line {
  const centre = (from + to) / 2;
  const average = mean(points, from, to);
  let covariance = 0;
  let variance = 0;
  for (let index = from; index <= to; index += 1) {
    const offset = index - centre;
    covariance += offset * ((points[index] as number) - average);
    variance += offset * offset;
  }
  const slope = variance === 0 ? 0 : covariance / variance;
  return { intercept: average - slope * centre, slope, to };
}

function trendAt(line: Line, level: number, index: number): number {
  const inside = Math.min(index, line.to);
  const ahead = Math.max(0, index - line.to);
  const damped = ahead === 0 ? 0 : line.slope * TREND_DAMPING * ((1 - TREND_DAMPING ** ahead) / (1 - TREND_DAMPING));
  const value = line.intercept + line.slope * inside + damped;
  return Math.min(level * (1 + TREND_CLAMP), Math.max(level * (1 - TREND_CLAMP), value));
}

/** Share of the points that count as independent, from the lag-1 autocorrelation of the baseline residuals. */
function effectiveShare(residuals: readonly number[]): number {
  if (residuals.length < 4) return 1;
  const average = mean(residuals);
  let covariance = 0;
  let variance = 0;
  for (let index = 0; index < residuals.length; index += 1) {
    const centred = (residuals[index] as number) - average;
    variance += centred * centred;
    if (index > 0) covariance += centred * ((residuals[index - 1] as number) - average);
  }
  if (variance === 0) return 1;
  const rho = Math.min(MAX_AUTOCORRELATION, Math.max(0, covariance / variance));
  return (1 - rho) / (1 + rho);
}

type Baseline = { expected: number[]; sigma: number; share: number; level: number };

/** Days the calendar explains (a no-sale day and the ordering around it): left out of the baseline and read as expected inside a window. */
export type SkipMask = readonly boolean[] | null;

function meanUnskipped(values: readonly number[], from: number, to: number, skip: SkipMask): number {
  let sum = 0;
  let count = 0;
  for (let index = from; index <= to; index += 1) {
    if (skip?.[index]) continue;
    sum += values[index] as number;
    count += 1;
  }
  return count === 0 ? 0 : sum / count;
}

function baselineEndingAt(values: readonly number[], season: readonly number[], windowStart: number, options: ScanOptions, skip: SkipMask): Baseline | null {
  const to = windowStart - 1;
  const from = Math.max(0, to - options.baseline + 1);
  if (to - from + 1 < options.minBaseline) return null;
  const level = meanUnskipped(values, from, to, skip);
  if (level <= 0) return null;
  const factors = seasonFactors(values, season, from, to, level, skip);
  const flattened = new Array<number>(values.length).fill(0);
  for (let index = from; index <= to; index += 1) {
    const factor = factors[season[index] as number] as number;
    if (skip?.[index]) flattened[index] = level;
    else flattened[index] = factor > 0 ? (values[index] as number) / factor : (values[index] as number);
  }
  const line = fitLine(flattened, from, to);
  const expected = new Array<number>(values.length).fill(0);
  for (let index = from; index < values.length; index += 1) {
    expected[index] = trendAt(line, level, index) * (factors[season[index] as number] as number);
  }
  const residuals: number[] = [];
  for (let index = from; index <= to; index += 1) {
    if (!skip?.[index]) residuals.push((values[index] as number) - (expected[index] as number));
  }
  return { expected, sigma: Math.max(stdev(residuals), level * (options.sigmaFloorShare ?? SIGMA_FLOOR_SHARE)), share: effectiveShare(residuals), level };
}

/** A sustained breach: the newest points never recover above `ceiling`, measured against the plain trailing baseline. */
export function scanFloor(values: readonly number[], ceiling: number, length: number): Scan | null {
  const to = values.length - 1;
  const from = to - length + 1;
  if (from <= 0) return null;
  let highest = 0;
  for (let index = from; index <= to; index += 1) highest = Math.max(highest, values[index] as number);
  if (highest > ceiling) return null;
  const baseTo = from - 1;
  const baseFrom = Math.max(0, baseTo - DAILY_SCAN.baseline + 1);
  if (baseTo - baseFrom + 1 < DAILY_SCAN.minBaseline) return null;
  const expected = mean(values, baseFrom, baseTo);
  const observed = mean(values, from, to);
  const sigma = Math.max(stdev(values.slice(baseFrom, baseTo + 1)), expected * SIGMA_FLOOR_SHARE);
  const z = (observed - expected) / sigma;
  return { length, from, to, observed, expected, sigma, z, direction: z >= 0 ? "up" : "down" };
}

/** The contiguous recent window whose deviation from the seasonal, detrended baseline before it is least likely to be noise. */
export function scanSeries(values: readonly number[], season: readonly number[], options: ScanOptions = DAILY_SCAN, skip: SkipMask = null): Scan | null {
  const last = values.length - 1;
  const earliest = values.length - options.tail;
  if (earliest <= 0) return null;
  const latestStart = last - options.minWindow + 1;
  const candidates: Scan[] = [];
  for (let from = earliest; from <= latestStart; from += 1) {
    const baseline = baselineEndingAt(values, season, from, options, skip);
    if (!baseline) continue;
    let observedSum = 0;
    let expectedSum = 0;
    for (let to = from; to <= last; to += 1) {
      observedSum += skip?.[to] ? (baseline.expected[to] as number) : (values[to] as number);
      expectedSum += baseline.expected[to] as number;
      const length = to - from + 1;
      if (length < options.minWindow || to < last - options.maxLag + 1) continue;
      const z = ((observedSum - expectedSum) * Math.sqrt(baseline.share / length)) / baseline.sigma;
      candidates.push({
        length,
        from,
        to,
        observed: observedSum / length,
        expected: expectedSum / length,
        sigma: baseline.sigma,
        z,
        direction: z >= 0 ? "up" : "down",
      });
    }
  }
  return earliestOnset(candidates);
}

/** Among the windows that explain the movement about equally well, the one that started first. */
function earliestOnset(candidates: readonly Scan[]): Scan | null {
  let strongest: Scan | null = null;
  for (const candidate of candidates) {
    if (!strongest || Math.abs(candidate.z) > Math.abs(strongest.z)) strongest = candidate;
  }
  if (!strongest) return null;
  const floor = Math.abs(strongest.z) * ONSET_TOLERANCE;
  let earliest = strongest;
  for (const candidate of candidates) {
    if (candidate.direction !== strongest.direction || Math.abs(candidate.z) < floor) continue;
    if (candidate.from < earliest.from) earliest = candidate;
  }
  return earliest;
}
