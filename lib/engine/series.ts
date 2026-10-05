import type { Dim, MetricId } from "@/lib/contracts";
import { runSeries } from "@/lib/data/query";
import {
  DAY_COUNT, DOW_OF_DAY, ISO_OF_DAY, MONTH_COUNT, MONTH_KEYS, TODAY, addDays, monthIndexOfKey, toDayIndex,
} from "@/lib/data/dates";
import { ALCOHOL_BAN_FLAGS, LENT_FLAGS } from "@/lib/data/entities/calendar";
import { BRAND_INFO, LITRES_PER_HL, skuById } from "@/lib/data/entities/products";
import { PLANTS, PRODUCTION_LINES } from "@/lib/data/entities/supply";
import { productionTables } from "@/lib/data/cache";
import { LOOKBACK_DAYS, LOOKBACK_MONTHS, YEAR_MONTHS, type Watch } from "./watches";

export type EntitySeries = { key: string; dims: Partial<Record<Dim, string>>; values: number[]; season: number[]; startDay: number; subKey: string | null; detail: string | null };

const MONTH_SEASON = 0;
const BAN_ORDERING_DAYS = 2;
const CALENDAR_SENSITIVE: ReadonlySet<MetricId> = new Set<MetricId>(["net_sales_volume", "net_sales_value", "sell_out_volume"]);

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

function nearBanDay(dayIdx: number): boolean {
  for (let offset = 0; offset <= BAN_ORDERING_DAYS; offset += 1) {
    const ahead = dayIdx + offset;
    if (ahead < DAY_COUNT && ALCOHOL_BAN_FLAGS[ahead] === 1) return true;
  }
  return false;
}

function isNonAlcohol(dims: Partial<Record<Dim, string>>): boolean {
  const brand = dims.brand ?? (dims.sku ? skuById(dims.sku)?.brand : undefined);
  return BRAND_INFO.find((info) => info.id === brand)?.businessUnit === "non_alcohol";
}

const LENT_EFFECT_SPAN_DAYS = 28;
const LAST_YEAR_LENT_START = "2025-07-11";

function spanMean(values: ReadonlyMap<string, number>, fromIso: string, days: number): number {
  let sum = 0;
  let count = 0;
  for (let offset = 0; offset < days; offset += 1) {
    const iso = addDays(fromIso, offset);
    const dayIdx = toDayIndex(iso);
    if (dayIdx < 0 || nearBanDay(dayIdx)) continue;
    sum += values.get(iso) ?? 0;
    count += 1;
  }
  return count === 0 ? 0 : sum / count;
}

let lentEffectCache: number | null = null;

function stepAtLentStart(businessUnit: string): number {
  const from = addDays(LAST_YEAR_LENT_START, -LENT_EFFECT_SPAN_DAYS);
  const to = addDays(LAST_YEAR_LENT_START, LENT_EFFECT_SPAN_DAYS - 1);
  const rows = runSeries({ metric: "net_sales_volume", dims: ["date"], filters: { business_unit: [businessUnit] }, range: { from, to } });
  const byDate = new Map(rows.map((row) => [row.dims.date as string, row.value]));
  const before = spanMean(byDate, from, LENT_EFFECT_SPAN_DAYS);
  const during = spanMean(byDate, LAST_YEAR_LENT_START, LENT_EFFECT_SPAN_DAYS);
  return before > 0 && during > 0 ? during / before : 1;
}

/** How much beer sell-in moves when Buddhist Lent starts: last year's step in beer against water and soda over the same days, so the season cancels out. */
export function lentEffect(): number {
  if (lentEffectCache !== null) return lentEffectCache;
  lentEffectCache = stepAtLentStart("beer") / stepAtLentStart("non_alcohol");
  return lentEffectCache;
}

/** Which slots of a daily sales series a no-sale day explains (the day and the ordering before it): the scan neither alarms on them nor learns from them. */
export function calendarSkipFor(watch: Watch, series: EntitySeries): boolean[] | null {
  if (!isCalendarSensitive(watch, series)) return null;
  return series.values.map((_, slot) => nearBanDay(series.startDay + slot));
}

function isCalendarSensitive(watch: Watch, series: EntitySeries): boolean {
  return watch.grain === "day" && CALENDAR_SENSITIVE.has(watch.metric) && !isNonAlcohol(series.dims);
}

/** Beer days on the other side of the latest Lent start or end, rescaled to the level of the current side, so a Lent step is not read as a trend. */
export function inLentRegime(watch: Watch, series: EntitySeries): number[] {
  if (!isCalendarSensitive(watch, series)) return series.values;
  const lastDay = series.startDay + series.values.length - 1;
  const current = LENT_FLAGS[lastDay] === 1;
  const effect = lentEffect();
  return series.values.map((value, slot) => {
    const inLent = LENT_FLAGS[series.startDay + slot] === 1;
    if (inLent === current) return value;
    return current ? value * effect : value / effect;
  });
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
