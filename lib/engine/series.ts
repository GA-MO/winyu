import type { Dim } from "@/lib/contracts";
import { runSeries } from "@/lib/data/query";
import {
  DAY_COUNT, DOW_OF_DAY, ISO_OF_DAY, MONTH_COUNT, MONTH_KEYS, TODAY, addDays, monthIndexOfKey, toDayIndex,
} from "@/lib/data/dates";
import { LITRES_PER_HL } from "@/lib/data/entities/products";
import { PLANTS, PRODUCTION_LINES } from "@/lib/data/entities/supply";
import { productionTables } from "@/lib/data/cache";
import { LOOKBACK_DAYS, LOOKBACK_MONTHS, YEAR_MONTHS, type Watch } from "./watches";

export type EntitySeries = { key: string; dims: Partial<Record<Dim, string>>; values: number[]; season: number[]; startDay: number; subKey: string | null; detail: string | null };

const MONTH_SEASON = 0;

function dayWindow(endDay: number, length: number): { from: number; to: number } {
  const to = Math.min(DAY_COUNT - 1, endDay);
  return { from: Math.max(0, to - length + 1), to };
}

function monthWindow(): { from: number; to: number } {
  return { from: Math.max(0, MONTH_COUNT - LOOKBACK_MONTHS), to: MONTH_COUNT - 2 };
}

function toYearOverYear(series: EntitySeries): EntitySeries | null {
  const values: number[] = [];
  for (let slot = YEAR_MONTHS; slot < series.values.length; slot += 1) {
    const before = series.values[slot - YEAR_MONTHS] as number;
    if (before <= 0) return null;
    values.push((series.values[slot] as number) / before);
  }
  if (values.length === 0) return null;
  return { ...series, values, season: new Array<number>(values.length).fill(MONTH_SEASON), startDay: series.startDay + YEAR_MONTHS };
}

function timeDimOf(watch: Watch): Dim {
  return watch.grain === "month" ? "month" : "date";
}

function collect(watch: Watch, range: { from: string; to: string }, slots: number, slotOf: (value: string) => number): EntitySeries[] {
  const rows = runSeries({ metric: watch.metric, dims: [timeDimOf(watch), ...watch.entityDims], filters: {}, range });
  const byEntity = new Map<string, EntitySeries>();
  const timeDim = timeDimOf(watch);
  for (const row of rows) {
    const slot = slotOf(row.dims[timeDim] as string);
    if (slot < 0 || slot >= slots) continue;
    const key = watch.entityDims.map((dim) => row.dims[dim]).join("|");
    let series = byEntity.get(key);
    if (!series) {
      const dims: Partial<Record<Dim, string>> = {};
      for (const dim of watch.entityDims) dims[dim] = row.dims[dim];
      series = { key, dims, values: new Array<number>(slots).fill(0), season: [], startDay: 0, subKey: null, detail: null };
      byEntity.set(key, series);
    }
    series.values[slot] += row.value;
  }
  return [...byEntity.values()];
}

/** One series per production line: the batch plane reads deeper than the metric dims expose. */
function productionLineSeries(): EntitySeries[] {
  const window = dayWindow(DAY_COUNT - 1, LOOKBACK_DAYS);
  const slots = window.to - window.from + 1;
  const season: number[] = [];
  for (let slot = 0; slot < slots; slot += 1) season.push(DOW_OF_DAY[window.from + slot] as number);
  const output = productionTables().outputHl;
  return PRODUCTION_LINES.map((entry, lineIndex) => {
    const plant = PLANTS[entry.plantIndex] as (typeof PLANTS)[number];
    const values: number[] = [];
    for (let slot = 0; slot < slots; slot += 1) values.push((output[lineIndex * DAY_COUNT + window.from + slot] as number) * LITRES_PER_HL);
    return {
      key: entry.line.id,
      dims: { plant: plant.id, region: plant.region } as Partial<Record<Dim, string>>,
      values,
      season,
      startDay: window.from,
      subKey: entry.line.id,
      detail: entry.line.nameTh,
    };
  });
}

/** Dense day-of-week-aware series per entity for one watch, newest point last. */
export function seriesFor(watch: Watch): EntitySeries[] {
  if (watch.id === "output_plant") return productionLineSeries();
  if (watch.grain === "month") {
    const window = monthWindow();
    const slots = window.to - window.from + 1;
    const range = { from: "2025-04-01", to: TODAY };
    const season = new Array<number>(slots).fill(MONTH_SEASON);
    const monthly = collect(watch, range, slots, (key) => monthIndexOfKey(key) - window.from).map((series) => ({ ...series, season, startDay: window.from }));
    if (watch.transform !== "year_over_year") return monthly;
    return monthly.map(toYearOverYear).filter((series): series is EntitySeries => series !== null);
  }
  const window = dayWindow(DAY_COUNT - 1, LOOKBACK_DAYS);
  const slots = window.to - window.from + 1;
  const range = { from: ISO_OF_DAY[window.from] as string, to: ISO_OF_DAY[window.to] as string };
  const season: number[] = [];
  for (let slot = 0; slot < slots; slot += 1) season.push(DOW_OF_DAY[window.from + slot] as number);
  return collect(watch, range, slots, (iso) => toDayIndex(iso) - window.from).map((series) => ({ ...series, season, startDay: window.from }));
}

export function isoOfSlot(series: EntitySeries, slot: number, grain: "day" | "month"): string {
  if (grain === "month") {
    const key = MONTH_KEYS[series.startDay + slot] as string;
    return `${key}-01`;
  }
  return ISO_OF_DAY[series.startDay + slot] as string;
}

export function monthEnd(iso: string): string {
  const [year, month] = iso.split("-").map(Number);
  const next = month === 12 ? `${(year ?? 0) + 1}-01-01` : `${year}-${String((month ?? 1) + 1).padStart(2, "0")}-01`;
  return addDays(next, -1);
}
