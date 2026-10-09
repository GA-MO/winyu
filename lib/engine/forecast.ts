import type { Dim, Forecast, MetricId } from "@/lib/contracts";
import { readSeries } from "@/lib/server/metrics";
import { DAY_COUNT, ISO_OF_DAY, WEEK_KEYS, WEEK_OF_DAY, addDays, weekIndexOfKey } from "@/lib/data/dates";
import { BRANDS } from "@/lib/contracts";
import { REGIONS } from "@/lib/contracts";
import { DISTRIBUTION_CENTERS } from "@/lib/data/entities/supply";
import { SKUS } from "@/lib/data/entities/products";
import { mean, stdev } from "./stats";

export const HORIZON_WEEKS = 8;
export const BACKTEST_WEEKS = 12;
const YEAR_WEEKS = 52;
const COVER_PERIOD = 4;
const DAMPING = 0.92;
const BAND_Z = 1.28;
const SMOOTHING_GRID = [0.05, 0.1, 0.2, 0.35, 0.5];
const MIN_WEEKS = 20;
const MIN_LEVEL = 1;
const PERCENT = 100;
const DECIMALS = 1;

type Weights = { alpha: number; beta: number; gamma: number };

type Model = { level: number; trend: number; seasonal: number[]; period: number; residuals: number[] };

function seasonalStart(values: readonly number[], period: number): number[] {
  const usable = Math.min(period, values.length);
  const level = mean(values, 0, usable - 1);
  const seasonal = new Array<number>(period).fill(0);
  for (let index = 0; index < usable; index += 1) seasonal[index % period] = (values[index] as number) - level;
  return seasonal;
}

function fit(values: readonly number[], period: number, weights: Weights): Model | null {
  if (values.length < period + 2) return null;
  const seasonal = seasonalStart(values, period);
  let level = mean(values, 0, period - 1);
  let trend = (mean(values, period, Math.min(values.length, period * 2) - 1) - level) / period;
  const residuals: number[] = [];
  for (let index = period; index < values.length; index += 1) {
    const slot = index % period;
    const predicted = level + DAMPING * trend + (seasonal[slot] as number);
    const actual = values[index] as number;
    residuals.push(actual - predicted);
    const previousLevel = level;
    level = weights.alpha * (actual - (seasonal[slot] as number)) + (1 - weights.alpha) * (level + DAMPING * trend);
    trend = weights.beta * (level - previousLevel) + (1 - weights.beta) * DAMPING * trend;
    seasonal[slot] = weights.gamma * (actual - level) + (1 - weights.gamma) * (seasonal[slot] as number);
  }
  return { level, trend, seasonal, period, residuals };
}

function project(model: Model, from: number, steps: number): number[] {
  const out: number[] = [];
  let damped = 0;
  for (let step = 1; step <= steps; step += 1) {
    damped += DAMPING ** step;
    const slot = (from + step) % model.period;
    out.push(Math.max(0, model.level + damped * model.trend + (model.seasonal[slot] as number)));
  }
  return out;
}

function bestFit(values: readonly number[], period: number): Model | null {
  let best: Model | null = null;
  let bestError = Number.POSITIVE_INFINITY;
  for (const alpha of SMOOTHING_GRID) {
    for (const beta of SMOOTHING_GRID) {
      for (const gamma of SMOOTHING_GRID) {
        const model = fit(values, period, { alpha, beta, gamma });
        if (!model) continue;
        const error = model.residuals.reduce((sum, value) => sum + value * value, 0) / model.residuals.length;
        if (error >= bestError) continue;
        bestError = error;
        best = model;
      }
    }
  }
  return best;
}

/** Mean absolute percentage error of an out-of-sample projection over the held-back weeks. */
export function backtest(values: readonly number[], period: number, weeks: number): number | null {
  if (values.length < period + weeks + 2) return null;
  const train = values.slice(0, values.length - weeks);
  const model = bestFit(train, period);
  if (!model) return null;
  const projected = project(model, train.length - 1, weeks);
  let sum = 0;
  let counted = 0;
  for (let step = 0; step < weeks; step += 1) {
    const actual = values[train.length + step] as number;
    if (actual <= 0) continue;
    sum += Math.abs((projected[step] as number) - actual) / actual;
    counted += 1;
  }
  return counted === 0 ? null : (sum / counted) * PERCENT;
}

type Target = { metric: MetricId; dims: Partial<Record<Dim, string>>; period: number };

function completeWeeks(): { keys: string[]; lastEnd: string } {
  const firstFull = WEEK_OF_DAY[0] === WEEK_OF_DAY[6] ? 0 : 1;
  const lastIndex = WEEK_OF_DAY[DAY_COUNT - 1] as number;
  const keys = WEEK_KEYS.slice(firstFull, lastIndex);
  const lastKey = keys[keys.length - 1] as string;
  let lastDay = DAY_COUNT - 1;
  while (lastDay > 0 && WEEK_KEYS[WEEK_OF_DAY[lastDay] as number] !== lastKey) lastDay -= 1;
  return { keys, lastEnd: ISO_OF_DAY[lastDay] as string };
}

async function weeklyValues(target: Target, keys: readonly string[]): Promise<number[]> {
  const filters = Object.fromEntries(Object.entries(target.dims).map(([dim, value]) => [dim, [value as string]]));
  const rows = await readSeries({ metric: target.metric, dims: ["week"], filters, range: { from: ISO_OF_DAY[0] as string, to: ISO_OF_DAY[DAY_COUNT - 1] as string } });
  const byWeek = new Map(rows.map((row) => [row.dims.week as string, row.value]));
  return keys.map((key) => byWeek.get(key) ?? 0);
}

function idOf(target: Target): string {
  return ["fc", target.metric, ...Object.entries(target.dims).map(([dim, value]) => `${dim}-${value}`)].join("_");
}

async function forecastOne(target: Target, keys: readonly string[], lastEnd: string): Promise<Forecast | null> {
  const values = await weeklyValues(target, keys);
  if (values.length < MIN_WEEKS || mean(values) < MIN_LEVEL) return null;
  const model = bestFit(values, target.period);
  if (!model) return null;
  const projected = project(model, values.length - 1, HORIZON_WEEKS);
  const sigma = stdev(model.residuals);
  const mape = backtest(values, target.period, BACKTEST_WEEKS);
  const points = projected.map((value, step) => {
    const spread = BAND_Z * sigma * Math.sqrt(step + 1);
    return {
      date: addDays(lastEnd, (step + 1) * 7 - 6),
      value: Math.round(value * 10 ** DECIMALS) / 10 ** DECIMALS,
      lo: Math.round(Math.max(0, value - spread) * 10 ** DECIMALS) / 10 ** DECIMALS,
      hi: Math.round((value + spread) * 10 ** DECIMALS) / 10 ** DECIMALS,
    };
  });
  return {
    id: idOf(target),
    metric: target.metric,
    dims: target.dims,
    horizon: { from: points[0]?.date ?? lastEnd, to: points[points.length - 1]?.date ?? lastEnd },
    points,
    mape: mape === null ? 0 : Math.round(mape * 10 ** DECIMALS) / 10 ** DECIMALS,
    method: "holt_winters",
  };
}

export function forecastTargets(): Target[] {
  const volume: Target[] = BRANDS.flatMap((brand) => REGIONS.map((region) => ({ metric: "net_sales_volume" as MetricId, dims: { brand, region }, period: YEAR_WEEKS })));
  const cover: Target[] = DISTRIBUTION_CENTERS.flatMap((dc) => SKUS.map((sku) => ({ metric: "days_of_cover" as MetricId, dims: { dc: dc.id, sku: sku.id }, period: COVER_PERIOD })));
  return [...volume, ...cover];
}

/** The deterministic eight-week forecast for every watched slice, with its backtest error. */
export async function buildForecasts(): Promise<Forecast[]> {
  const { keys, lastEnd } = completeWeeks();
  const out: Forecast[] = [];
  for (const target of forecastTargets()) {
    const forecast = await forecastOne(target, keys, lastEnd);
    if (forecast) out.push(forecast);
  }
  return out;
}

export async function weeklySeriesFor(metric: MetricId, dims: Partial<Record<Dim, string>>): Promise<{ values: number[]; keys: string[] }> {
  const { keys } = completeWeeks();
  return { values: await weeklyValues({ metric, dims, period: YEAR_WEEKS }, keys), keys: [...keys] };
}

export { YEAR_WEEKS, COVER_PERIOD, weekIndexOfKey };
