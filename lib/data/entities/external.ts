import { DAY_COUNT, DAY_OF_YEAR } from "../dates";
import { hashNoise } from "../random";

export const NORTHERN_PROVINCE_IDS = ["pv_chiangmai", "pv_chiangrai", "pv_lamphun", "pv_phitsanulok"] as const;
export const PM25_SPIKE_PROVINCE_IDS = ["pv_chiangmai", "pv_lamphun"] as const;
export const PM25_SPIKE_DAYS = 6;
const PM25_SPIKE_FACTOR = 2.35;
const PM25_BASELINE = 24;
const PM25_HIGH_SEASON_PEAK = 96;

function highSeasonWeight(dayOfYear: number): number {
  if (dayOfYear >= 335 || dayOfYear <= 120) {
    const distance = dayOfYear >= 335 ? dayOfYear - 335 : dayOfYear + 30;
    return Math.sin((Math.PI * distance) / 150);
  }
  return 0;
}

function buildPm25(): Record<string, Float64Array> {
  const table: Record<string, Float64Array> = {};
  const spikeStart = DAY_COUNT - PM25_SPIKE_DAYS;
  for (const provinceId of NORTHERN_PROVINCE_IDS) {
    const series = new Float64Array(DAY_COUNT);
    const localBias = 0.85 + hashNoise("pm25_bias", provinceId) * 0.4;
    for (let day = 0; day < DAY_COUNT; day += 1) {
      const seasonal = PM25_BASELINE + PM25_HIGH_SEASON_PEAK * highSeasonWeight(DAY_OF_YEAR[day] as number);
      const noise = 0.72 + hashNoise("pm25", provinceId, day) * 0.56;
      let value = seasonal * localBias * noise;
      if (day >= spikeStart && (PM25_SPIKE_PROVINCE_IDS as readonly string[]).includes(provinceId)) {
        value *= PM25_SPIKE_FACTOR * (1 + (day - spikeStart) * 0.07);
      }
      series[day] = Math.round(value * 10) / 10;
    }
    table[provinceId] = series;
  }
  return table;
}

const PM25 = buildPm25();

export function pm25Series(provinceId: string): Float64Array | null {
  return PM25[provinceId] ?? null;
}

export function pm25On(provinceId: string, dayIndex: number): number {
  return PM25[provinceId]?.[dayIndex] ?? 0;
}
