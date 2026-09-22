import { DAY_COUNT, DAY_OF_YEAR, ISO_OF_DAY } from "../dates";
import { hashNoise } from "../random";

export const NORTHERN_PROVINCE_IDS = ["pv_chiangmai", "pv_chiangrai", "pv_lamphun", "pv_phitsanulok"] as const;
export const PM25_SPIKE_PROVINCE_IDS = ["pv_chiangmai", "pv_lamphun"] as const;
export const PM25_SPIKE_DAYS = 6;
const PM25_SPIKE_FACTOR = 2.35;
const PM25_BASELINE = 24;
const PM25_HIGH_SEASON_PEAK = 96;
const TEMP_MEAN_C = 28.6;
const TEMP_AMPLITUDE_C = 4.4;
const TEMP_PEAK_DAY_OF_YEAR = 105;

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

export const TEMPERATURE_C = (() => {
  const series = new Float64Array(DAY_COUNT);
  for (let day = 0; day < DAY_COUNT; day += 1) {
    const phase = (2 * Math.PI * (((DAY_OF_YEAR[day] as number) - TEMP_PEAK_DAY_OF_YEAR + 365) % 365)) / 365;
    const noise = (hashNoise("temp", day) - 0.5) * 2.2;
    series[day] = Math.round((TEMP_MEAN_C + TEMP_AMPLITUDE_C * Math.cos(phase) + noise) * 10) / 10;
  }
  return series;
})();

export function temperatureOn(dayIndex: number): number {
  return TEMPERATURE_C[dayIndex] ?? TEMP_MEAN_C;
}

export function externalSnapshot(dayIndex: number): { date: string; temperatureC: number; pm25: Record<string, number> } {
  const pm25: Record<string, number> = {};
  for (const provinceId of NORTHERN_PROVINCE_IDS) pm25[provinceId] = pm25On(provinceId, dayIndex);
  return { date: ISO_OF_DAY[dayIndex] ?? "", temperatureC: temperatureOn(dayIndex), pm25 };
}
