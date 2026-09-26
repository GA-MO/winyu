import {
  type AccessContext, type Brand, type Dim, type FactRequest, type FactResult, type FactRow, type LabelShift, type MetricDef, type MetricId,
  type MetricQuery, type MetricSort, type MetricHeadline, type MetricResult, type MetricRow, type Provenance, type Region, type ValueFilter,
} from "@/lib/contracts";
import { MONTHLY_METRICS, RATIO_METRICS, TARGET_METRICS, TIME_DIMS, metricDef } from "@/lib/semantic/metrics";
import { MIN_CELL_SIZE, SUPPRESSED_FIELDS, SUPPRESSED_VALUE, cellScopeOf, isSmallCell } from "@/lib/access/suppression";
import type { Dictionary } from "@/lib/semantic/dictionary";
import { DAY_COUNT, ISO_OF_DAY, MONTH_COUNT, MONTH_FIRST_DAY, MONTH_OF_DAY, TODAY, daysInMonthIndex, formatThaiDate, toDayIndex } from "@/lib/data/dates";

const DEFAULT_LIMIT = 60;
const PREV_YEAR_DAYS = 364;
const MONTHS_PER_YEAR = 12;
const DAYS_PER_WEEK = 7;
const WEEKDAY_ALIGN_BELOW_DAYS = 28;
const PERCENT = 100;
const NO_SHIFT: LabelShift = { days: 0, months: 0 };

type Failure = { ok: false; error: string; code: "PERMISSION_DENIED" | "UNKNOWN_METRIC" | "BAD_QUERY" };
type Filters = Map<Dim, Set<string>>;
type Aggregated = { key: string; dims: Record<Dim, string>; value: number; weight: number };

function fail(code: Failure["code"], error: string): Failure {
  return { ok: false, error, code };
}

const ALREADY_VS_TARGET: ReadonlySet<MetricId> = new Set<MetricId>(["target_attainment"]);

/** Filters a metric needs to mean anything when the caller leaves the dimension out: the shares of every maker always add up to 100%. */
function defaultFiltersOf(metric: MetricId, dictionary: Dictionary): Partial<Record<Dim, string>> {
  return metric === "market_share" ? { maker: dictionary.master.ownMaker } : {};
}

const SNAPSHOT_METRICS: ReadonlySet<MetricId> = new Set<MetricId>(["stock_on_hand", "days_of_cover", "ar_overdue"]);

const SUMMED_ACROSS_NON_TIME: ReadonlySet<MetricId> = new Set<MetricId>(["headcount"]);

function averagedHeadline(def: MetricDef, query: MetricQuery, ratio: boolean): boolean {
  if (!ratio) return false;
  return !SUMMED_ACROSS_NON_TIME.has(def.id) || query.dims.some((dim) => TIME_DIMS.includes(dim));
}

function scopeRegions(access: AccessContext): Region[] | null {
  return access.regions === "all" ? null : [...access.regions];
}

function scopeBrands(access: AccessContext): Brand[] | null {
  return access.brands === "all" ? null : [...access.brands];
}

function normalizeFilters(query: MetricQuery, def: MetricDef, dictionary: Dictionary): Filters | Failure {
  const filters: Filters = new Map();
  for (const [dim, values] of Object.entries(query.filters) as [Dim, string[] | undefined][]) {
    if (!values || values.length === 0) continue;
    if (!def.dims.includes(dim)) return fail("BAD_QUERY", `ตัวกรอง ${dim} ใช้กับเมตริก ${def.id} ไม่ได้`);
    const resolved = new Set<string>();
    for (const value of values) {
      const id = dictionary.resolveDimValue(dim, value);
      if (!id) return fail("BAD_QUERY", `ไม่รู้จักค่า "${value}" ของมิติ ${dim}`);
      resolved.add(id);
    }
    filters.set(dim, resolved);
  }
  for (const [dim, value] of Object.entries(defaultFiltersOf(def.id, dictionary)) as [Dim, string][]) {
    if (!filters.has(dim) && !query.dims.includes(dim)) filters.set(dim, new Set([value]));
  }
  return filters;
}

function applyScope(filters: Filters, def: MetricDef, access: AccessContext, dictionary: Dictionary): { scopeApplied: Partial<Record<Dim, string[]>> } | Failure {
  const scopeApplied: Partial<Record<Dim, string[]>> = {};
  const regions = scopeRegions(access);
  if (regions) {
    for (const dim of def.aclDims) {
      const values = filters.get(dim);
      if (!values) continue;
      for (const value of values) {
        const region = dictionary.regionOf(dim, value);
        if (region && !regions.includes(region)) {
          return fail("PERMISSION_DENIED", `คุณไม่มีสิทธิ์ดูข้อมูลของ ${dictionary.displayLabel(dim, value)} (นอกขอบเขตภาคที่รับผิดชอบ)`);
        }
      }
    }
    if (def.dims.includes("region") && !filters.has("region")) {
      filters.set("region", new Set(regions));
      scopeApplied.region = [...regions];
    }
  }
  const brands = scopeBrands(access);
  if (brands) {
    for (const dim of def.aclDims) {
      const values = filters.get(dim);
      if (!values) continue;
      for (const value of values) {
        const brand = dictionary.brandOf(dim, value);
        if (brand && !brands.includes(brand)) {
          return fail("PERMISSION_DENIED", `คุณไม่มีสิทธิ์ดูข้อมูลของแบรนด์ ${dictionary.displayLabel(dim, value)}`);
        }
      }
    }
    if (def.dims.includes("brand") && !filters.has("brand")) {
      filters.set("brand", new Set(brands));
      scopeApplied.brand = [...brands];
    }
  }
  return { scopeApplied };
}

function roundValue(format: MetricDef["format"], value: number): number {
  if (format === "currency") return Math.round(value);
  if (format === "percent") return Math.round(value * 10) / 10;
  return Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 100) / 100;
}

function formatNumber(value: number, fractionDigits: number): string {
  return new Intl.NumberFormat("th-TH", { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(value);
}

const WHOLE_UNITS: ReadonlySet<string> = new Set(["คน"]);
const MILLION_UNITS: ReadonlySet<string> = new Set(["ลิตร"]);
const MILLION = 1_000_000;

/** A metric amount the way rows and summaries print it: "19.9 ล้านบาท", "353,359 ลิตร", "93.3%". */
export function formatForSummary(def: MetricDef, value: number): string {
  if (def.format === "percent") return `${formatNumber(value, 1)}%`;
  if (def.format === "currency") {
    if (Math.abs(value) >= MILLION) return `${formatNumber(value / MILLION, 1)} ล้านบาท`;
    return `${formatNumber(Math.round(value), 0)} บาท`;
  }
  if (MILLION_UNITS.has(def.unit) && Math.abs(value) >= MILLION) return `${formatNumber(value / MILLION, 1)} ล้าน${def.unit}`;
  const digits = Math.abs(value) >= 100 || WHOLE_UNITS.has(def.unit) ? 0 : 1;
  return `${formatNumber(value, digits)} ${def.unit}`;
}

function firstTimeDim(dims: Dim[]): Dim | null {
  return dims.find((dim) => TIME_DIMS.includes(dim)) ?? null;
}

const RISK_WHEN_LOW: ReadonlySet<MetricId> = new Set<MetricId>(["days_of_cover"]);

function changeOf(row: Aggregated, previous: Map<string, number> | null): number | null {
  const before = previous?.get(row.key);
  if (before === undefined || before === 0) return null;
  return (row.value - before) / Math.abs(before);
}

/** The rows the question asked for, cut after ordering: "the ten that fell most" must rank every row by its change before keeping ten. */
function orderedRows(rows: Aggregated[], sort: MetricSort, limit: number, compareRows: Aggregated[] | null): Aggregated[] {
  if (sort === "value_desc") return [...rows].sort((left, right) => right.value - left.value).slice(0, limit);
  if (sort === "value_asc") return [...rows].sort((left, right) => left.value - right.value).slice(0, limit);
  const previous = compareRows ? indexCompare(compareRows) : null;
  const sign = sort === "delta_asc" ? 1 : -1;
  const scored = rows.map((row) => ({ row, change: changeOf(row, previous) }));
  const known = scored.filter((entry) => entry.change !== null).sort((left, right) => sign * ((left.change as number) - (right.change as number)));
  const unknown = scored.filter((entry) => entry.change === null).sort((left, right) => right.row.value - left.row.value);
  return [...known, ...unknown].slice(0, limit).map((entry) => entry.row);
}

function sortRows(rows: Aggregated[], dims: Dim[], limit: number, masked: boolean, lowFirst: boolean): Aggregated[] {
  const timeDim = firstTimeDim(dims);
  if (masked && !timeDim) {
    return [...rows].sort((left, right) => left.key.localeCompare(right.key)).slice(0, limit);
  }
  if (!timeDim) {
    return [...rows].sort((left, right) => (lowFirst ? left.value - right.value : right.value - left.value)).slice(0, limit);
  }
  const sorted = [...rows].sort((left, right) => (left.dims[timeDim] < right.dims[timeDim] ? -1 : left.dims[timeDim] > right.dims[timeDim] ? 1 : right.value - left.value));
  return sorted.length > limit ? sorted.slice(sorted.length - limit) : sorted;
}

function rangeDays(query: MetricQuery): { from: number; to: number } | Failure {
  const from = toDayIndex(query.range.from);
  const to = toDayIndex(query.range.to);
  if (Number.isNaN(from) || Number.isNaN(to)) return fail("BAD_QUERY", "ช่วงวันที่ไม่ถูกต้อง");
  if (to < from) return fail("BAD_QUERY", "วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น");
  const clampedFrom = Math.max(0, Math.min(DAY_COUNT - 1, from));
  const clampedTo = Math.max(0, Math.min(DAY_COUNT - 1, to));
  return { from: clampedFrom, to: clampedTo };
}

function indexCompare(rows: Aggregated[]): Map<string, number> {
  const table = new Map<string, number>();
  for (const row of rows) table.set(row.key, (table.get(row.key) ?? 0) + row.value);
  return table;
}

function allFilters(filters: Filters): Partial<Record<Dim, string[]>> {
  const out: Partial<Record<Dim, string[]>> = {};
  for (const [dim, values] of filters) out[dim] = [...values];
  return out;
}

function smallCellKeys(dictionary: Dictionary, metric: MetricId, dims: Dim[], rows: Aggregated[], filters: Filters): Set<string> {
  const applied = allFilters(filters);
  const keys = new Set<string>();
  for (const row of rows) {
    if (isSmallCell(dictionary.master, metric, dims, applied, cellScopeOf(dims, row.dims))) keys.add(row.key);
  }
  return keys;
}

function buildRows(dictionary: Dictionary, def: MetricDef, dims: Dim[], rows: Aggregated[], compareRows: Aggregated[] | null, masked: boolean, suppressed: Set<string>): MetricRow[] {
  const compareIndex = compareRows ? indexCompare(compareRows) : null;
  return rows.map((row) => {
    const out: MetricRow = {};
    for (const dim of dims) out[dim] = TIME_DIMS.includes(dim) ? row.dims[dim] : dictionary.displayLabel(dim, row.dims[dim]);
    if (masked || suppressed.has(row.key)) {
      out.value = SUPPRESSED_VALUE;
      out.value_label = SUPPRESSED_VALUE;
      if (compareIndex) {
        out.compare_value = SUPPRESSED_VALUE;
        out.delta_pct = SUPPRESSED_VALUE;
      }
      return out;
    }
    out.value = roundValue(def.format, row.value);
    out.value_label = formatForSummary(def, row.value);
    if (!compareIndex) return out;
    const previous = compareIndex.get(row.key);
    if (previous === undefined) {
      out.compare_value = null;
      out.delta_pct = null;
      return out;
    }
    out.compare_value = roundValue(def.format, previous);
    out.delta_pct = previous === 0 ? null : Math.round(((row.value - previous) / Math.abs(previous)) * 1000) / 10;
    return out;
  });
}

const COMPARE_LABELS: Record<MetricQuery["compare"], string | null> = {
  none: null,
  prev_period: "เทียบช่วงก่อนหน้า",
  prev_year: "เทียบปีก่อน",
  target: "เทียบเป้า",
};
const TOP_IN_HEADLINE = 3;
const DATA_START_LABEL = formatThaiDate(ISO_OF_DAY[0]);
const UNCOMPARABLE_LEAD = "ไม่มีข้อมูลให้";

function combined(rows: Aggregated[], averaged: boolean): number {
  if (!averaged) return rows.reduce((sum, row) => sum + row.value, 0);
  const weight = rows.reduce((sum, row) => sum + row.weight, 0);
  return weight === 0 ? 0 : rows.reduce((sum, row) => sum + row.value * row.weight, 0) / weight;
}

function deltaPercentOf(def: MetricDef, all: Aggregated[], compareRows: Aggregated[] | null, ratio: boolean): number | null {
  if (!compareRows || compareRows.length === 0 || all.length === 0) return null;
  const base = combined(compareRows, ratio);
  if (base === 0) return null;
  const current = combined(all, ratio);
  return Math.round(((current - base) / Math.abs(base)) * PERCENT * 10) / 10;
}

function topOf(dictionary: Dictionary, def: MetricDef, query: MetricQuery, all: Aggregated[], suppressed: Set<string>): { label: string; value: string }[] {
  const nonTimeDim = query.dims.find((dim) => !TIME_DIMS.includes(dim));
  if (!nonTimeDim) return [];
  return all
    .filter((row) => !suppressed.has(row.key))
    .sort((left, right) => (RISK_WHEN_LOW.has(def.id) ? left.value - right.value : right.value - left.value))
    .slice(0, TOP_IN_HEADLINE)
    .map((row) => ({ label: dictionary.displayLabel(nonTimeDim, row.dims[nonTimeDim]), value: formatForSummary(def, row.value) }));
}

/** The decision-grade numbers of a result: what a card puts in big type, before any prose. */
/** Rows the headline stands for: when the caller split by a dimension that has a default (maker for market share), the headline is the default's row, not a blend of every maker. */
function headlineSubset(dictionary: Dictionary, def: MetricDef, query: MetricQuery, rows: Aggregated[]): Aggregated[] {
  const defaults = Object.entries(defaultFiltersOf(def.id, dictionary)).filter(([dim]) => query.dims.includes(dim as Dim)) as [Dim, string][];
  const defaulted = defaults.length === 0 ? rows : rows.filter((row) => defaults.every(([dim, value]) => row.dims[dim] === value));
  return SNAPSHOT_METRICS.has(def.id) ? latestBucket(query.dims, defaulted) : defaulted;
}

/** Rows of the last time bucket: a stock level is read at the end of the period, never summed across its weeks or months. */
function latestBucket(dims: Dim[], rows: Aggregated[]): Aggregated[] {
  const timeDim = firstTimeDim(dims);
  if (!timeDim || rows.length === 0) return rows;
  const latest = rows.reduce((max, row) => (row.dims[timeDim] > max ? row.dims[timeDim] : max), rows[0].dims[timeDim]);
  return rows.filter((row) => row.dims[timeDim] === latest);
}

type HeadlineContext = { periodLabel: string; compareNote: string | null };

function headlineOf(dictionary: Dictionary, def: MetricDef, query: MetricQuery, rows: Aggregated[], all: Aggregated[], ratio: boolean, compareRows: Aggregated[] | null, masked: boolean, suppressed: Set<string>, context: HeadlineContext): MetricHeadline {
  const { periodLabel, compareNote } = context;
  const aggregate = ratio ? "average" : "sum";
  if (masked || all.length === 0) {
    return { aggregate, value: "—", periodLabel, rowCount: rows.length, deltaPercent: null, compareLabel: null, compareNote, top: [] };
  }
  const headlineRows = headlineSubset(dictionary, def, query, all);
  const deltaPercent = deltaPercentOf(def, headlineRows, compareRows ? headlineSubset(dictionary, def, query, compareRows) : null, ratio);
  return {
    aggregate,
    value: formatForSummary(def, combined(headlineRows, ratio)),
    periodLabel,
    rowCount: rows.length,
    deltaPercent,
    compareLabel: deltaPercent === null ? null : COMPARE_LABELS[query.compare] ?? "เทียบช่วงก่อนหน้า",
    compareNote,
    top: topOf(dictionary, def, query, all, suppressed),
  };
}

function summarize(def: MetricDef, query: MetricQuery, headline: MetricHeadline, masked: boolean, empty: boolean): string {
  const span = headline.periodLabel;
  if (masked) return `${def.labelTh} ${span}: ข้อมูลถูกปิดตามนโยบาย (masked) — เห็นได้เฉพาะโครงสร้างข้อมูล`;
  if (empty) return `${def.labelTh} ${span}: ไม่พบข้อมูลตามเงื่อนไขที่ขอ`;
  const lead = headline.aggregate === "average" ? "เฉลี่ย" : "รวม";
  const parts = [`${def.labelTh} ${span}: ${lead} ${headline.value}`];
  if (headline.top.length > 0) parts.push(`${RISK_WHEN_LOW.has(def.id) ? "ต่ำสุด" : "สูงสุด"}: ${headline.top.map((row) => `${row.label} ${row.value}`).join(" · ")}`);
  if (headline.deltaPercent !== null) {
    parts.push(`${headline.compareLabel} ${headline.deltaPercent >= 0 ? "+" : ""}${formatNumber(headline.deltaPercent, 1)}%`);
  }
  if (headline.compareNote) parts.push(headline.compareNote);
  parts.push(`(${headline.rowCount} แถว · ${def.certified ? "certified" : "derived"} · ${def.sourceSystem})`);
  return parts.join(" · ");
}

type PriorWindow = { from: number; to: number; shift: LabelShift };

function lastDayOfMonth(month: number): number {
  return month + 1 < MONTH_COUNT ? MONTH_FIRST_DAY[month + 1] - 1 : DAY_COUNT - 1;
}

function isMonthStart(day: number): boolean {
  return MONTH_FIRST_DAY[MONTH_OF_DAY[day]] === day;
}

function isMonthEnd(day: number): boolean {
  const next = new Date(`${ISO_OF_DAY[day]}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.getUTCDate() === 1;
}

function monthsBack(from: number, to: number, months: number, wholeLastMonth: boolean): PriorWindow | null {
  const firstMonth = MONTH_OF_DAY[from] - months;
  if (firstMonth < 0) return null;
  const lastMonth = MONTH_OF_DAY[to] - months;
  const daysIntoLastMonth = to - MONTH_FIRST_DAY[MONTH_OF_DAY[to]];
  const priorTo = wholeLastMonth ? lastDayOfMonth(lastMonth) : Math.min(MONTH_FIRST_DAY[lastMonth] + daysIntoLastMonth, lastDayOfMonth(lastMonth));
  const priorFrom = MONTH_FIRST_DAY[firstMonth];
  return { from: priorFrom, to: priorTo, shift: { days: from - priorFrom, months } };
}

/** How far back a short window's comparison sits: whole weeks, so Monday–Tuesday is read against Monday–Tuesday, not the weekend before it. */
function weekdayAlignedDays(length: number): number {
  if (length >= WEEKDAY_ALIGN_BELOW_DAYS || length % DAYS_PER_WEEK === 0) return length;
  return Math.ceil(length / DAYS_PER_WEEK) * DAYS_PER_WEEK;
}

function daysBack(from: number, to: number, days: number): PriorWindow | null {
  if (from - days < 0) return null;
  return { from: from - days, to: to - days, shift: { days, months: 0 } };
}

/** The window a compare reads, decided by the range alone so every breakdown of one question shares it: calendar months when the range is whole months (or month-to-date, cut at the same day), otherwise the same number of days, moved back in whole weeks when shorter than four weeks (364 back for a year), so weekdays line up. A balance is read against the close of the period just before, never a pro-rata or weekday-aligned slice. */
function priorWindow(compare: MetricQuery["compare"], from: number, to: number, wholeMonths: boolean, balance: boolean): PriorWindow | null {
  if (compare !== "prev_period" && compare !== "prev_year") return null;
  if (balance && compare === "prev_period" && !wholeMonths) return daysBack(from, to, to - from + 1);
  if (balance && compare === "prev_period") return monthsBack(from, to, MONTH_OF_DAY[to] - MONTH_OF_DAY[from] + 1, true);
  const monthAligned = wholeMonths || (isMonthStart(from) && (isMonthEnd(to) || to === DAY_COUNT - 1));
  if (monthAligned) {
    const months = compare === "prev_year" ? MONTHS_PER_YEAR : MONTH_OF_DAY[to] - MONTH_OF_DAY[from] + 1;
    return monthsBack(from, to, months, wholeMonths || isMonthEnd(to));
  }
  return daysBack(from, to, compare === "prev_year" ? PREV_YEAR_DAYS : weekdayAlignedDays(to - from + 1));
}

/** For a monthly total whose window ends in a month the data has only partly reached, the share of the window's calendar days the data covers; the comparison is scaled by it so September's 22 days are not read against a whole August. */
function coveredShare(def: MetricDef, compare: MetricQuery["compare"], from: number, to: number): number {
  if (!MONTHLY_METRICS.has(def.id) || RATIO_METRICS.has(def.id) || SNAPSHOT_METRICS.has(def.id)) return 1;
  if (compare !== "prev_period" && compare !== "prev_year") return 1;
  if (to !== DAY_COUNT - 1 || isMonthEnd(to)) return 1;
  let calendar = 0;
  for (let month = MONTH_OF_DAY[from]; month <= MONTH_OF_DAY[to]; month += 1) calendar += daysInMonthIndex(month);
  const covered = to - MONTH_FIRST_DAY[MONTH_OF_DAY[from]] + 1;
  return calendar > 0 ? covered / calendar : 1;
}

function partialMonthNote(share: number, to: number): string | null {
  return share < 1 ? `ข้อมูลเดือนล่าสุดถึง ${formatThaiDate(ISO_OF_DAY[to])} จึงเทียบกับงวดก่อนตามสัดส่วนวัน (${Math.round(share * PERCENT)}%)` : null;
}

/** Where the answer can start so its comparison exists: a year-on-year question that reaches back before the data is narrowed to the months both years hold, and every comparison the data cannot serve says why instead of vanishing. */
function comparableStart(compare: MetricQuery["compare"], from: number, to: number, wholeMonths: boolean, balance: boolean): { from: number; note: string | null } {
  if (compare !== "prev_period" && compare !== "prev_year") return { from, note: null };
  if (priorWindow(compare, from, to, wholeMonths, balance)) return { from, note: null };
  const narrowed = compare === "prev_year" ? earliestYearOnYear(from, to, wholeMonths) : null;
  if (narrowed === null) return { from, note: `${UNCOMPARABLE_LEAD}${COMPARE_LABELS[compare]}: ข้อมูลเริ่ม ${DATA_START_LABEL}` };
  return { from: narrowed, note: `เทียบปีก่อนได้ตั้งแต่ ${formatThaiDate(ISO_OF_DAY[narrowed])} เพราะข้อมูลเริ่ม ${DATA_START_LABEL}` };
}

function earliestYearOnYear(from: number, to: number, wholeMonths: boolean): number | null {
  const monthAligned = wholeMonths || (isMonthStart(from) && (isMonthEnd(to) || to === DAY_COUNT - 1));
  const start = monthAligned ? MONTH_FIRST_DAY[MONTHS_PER_YEAR] : PREV_YEAR_DAYS;
  if (start === undefined || start > to) return null;
  return Math.max(from, start);
}

function dedupe(dims: Dim[]): Dim[] {
  return [...new Set(dims)];
}

function filtersToRecord(filters: Filters, scopeApplied: Partial<Record<Dim, string[]>>): Partial<Record<Dim, string[]>> {
  const out: Partial<Record<Dim, string[]>> = {};
  for (const [dim, values] of filters) {
    if (scopeApplied[dim]) continue;
    out[dim] = [...values];
  }
  return out;
}

/** Thai names of the filters the caller narrowed to, beyond their own scope and the dimensions the rows already name. */
function filterLabelsOf(dictionary: Dictionary, filters: Filters, dims: Dim[], scopeApplied: Partial<Record<Dim, string[]>>): string[] {
  const labels: string[] = [];
  for (const [dim, values] of filters) {
    if (scopeApplied[dim] || dims.includes(dim)) continue;
    for (const value of values) labels.push(dictionary.displayLabel(dim, value));
  }
  return labels;
}

function factRequest(def: MetricDef, measure: FactRequest["measure"], dims: Dim[], filters: Filters, from: number, to: number, labelShift: LabelShift): FactRequest {
  return { metric: def.id, measure, dims, filters: allFilters(filters), range: { from: ISO_OF_DAY[from], to: ISO_OF_DAY[to] }, labelShift };
}

function comparisonOf(def: MetricDef, compare: MetricQuery["compare"], dims: Dim[], filters: Filters, from: number, to: number): FactRequest | Failure | null {
  if (compare === "none") return null;
  if (compare === "target") {
    if (!TARGET_METRICS.has(def.id)) return fail("BAD_QUERY", `เมตริก ${def.id} ไม่มีเป้าหมายให้เทียบ ใช้ compare "none" หรือเทียบงวดก่อนแทน`);
    return factRequest(def, "target", dims, filters, from, to, NO_SHIFT);
  }
  const previous = priorWindow(compare, from, to, MONTHLY_METRICS.has(def.id), SNAPSHOT_METRICS.has(def.id));
  return previous ? factRequest(def, "actual", dims, filters, previous.from, previous.to, previous.shift) : null;
}

/** Everything Cop decides about a question before the warehouse is asked: validated, scoped, and cut into fact requests. */
export type MetricPlan = {
  dictionary: Dictionary;
  def: MetricDef;
  query: MetricQuery;
  dims: Dim[];
  filters: Filters;
  scopeApplied: Partial<Record<Dim, string[]>>;
  masked: boolean;
  ratio: boolean;
  periodLabel: string;
  compareNote: string | null;
  comparisonScale: number;
  current: FactRequest;
  comparison: FactRequest | Failure | null;
};

/** Checks access and the question, injects the caller's scope, and states the facts the answer needs. */
export function planMetric(query: MetricQuery, access: AccessContext, dictionary: Dictionary): MetricPlan | Failure {
  const def = metricDef(query.metric);
  if (!def) return fail("UNKNOWN_METRIC", `ไม่รู้จักเมตริก "${query.metric}"`);
  const visibility = access.metricAcl[def.id] ?? "none";
  if (visibility === "none") return fail("PERMISSION_DENIED", `บทบาทของคุณไม่มีสิทธิ์ดูเมตริก ${def.labelTh}`);
  const unknownDim = query.dims.find((dim) => !def.dims.includes(dim));
  if (unknownDim) return fail("BAD_QUERY", `มิติ ${unknownDim} ใช้กับเมตริก ${def.id} ไม่ได้`);

  const range = rangeDays(query);
  if ("ok" in range) return range;
  const filters = normalizeFilters(query, def, dictionary);
  if ("ok" in filters) return filters;
  const scope = applyScope(filters, def, access, dictionary);
  if ("ok" in scope) return scope;

  const dims = dedupe(query.dims);
  if (query.where && visibility === "masked") return fail("BAD_QUERY", `กรองตามค่าไม่ได้เพราะตัวเลข ${def.labelTh} ถูกปิดสำหรับบทบาทของคุณ`);
  if (query.where && firstTimeDim(dims)) return fail("BAD_QUERY", "where กรองแถวตามค่าได้เฉพาะเมื่อไม่แยกตามเวลา");
  const compare = query.compare === "target" && ALREADY_VS_TARGET.has(def.id) ? "none" : query.compare;
  const start = comparableStart(compare, range.from, range.to, MONTHLY_METRICS.has(def.id), SNAPSHOT_METRICS.has(def.id));
  const share = coveredShare(def, compare, start.from, range.to);
  return {
    dictionary,
    def,
    query,
    dims,
    filters,
    scopeApplied: scope.scopeApplied,
    masked: visibility === "masked",
    ratio: RATIO_METRICS.has(def.id),
    periodLabel: `${formatThaiDate(ISO_OF_DAY[start.from])} – ${formatThaiDate(ISO_OF_DAY[range.to])}`,
    compareNote: start.note ?? partialMonthNote(share, range.to),
    comparisonScale: share,
    current: factRequest(def, "actual", dims, filters, start.from, range.to, NO_SHIFT),
    comparison: comparisonOf(def, compare, dims, filters, start.from, range.to),
  };
}

/** The comparison the plan still has to read, or null when it compares with nothing or already failed. */
export function comparisonRequestOf(plan: MetricPlan): FactRequest | null {
  if (!plan.comparison || "ok" in plan.comparison) return null;
  return plan.comparison;
}

/** Warehouse rows with the key Cop matches current and prior rows by. */
export function keyRows(dims: Dim[], rows: FactRow[]): Aggregated[] {
  return rows.map((row) => {
    const values = row.dims as Record<Dim, string>;
    return { key: dims.map((dim) => values[dim]).join("\u0001"), dims: values, value: row.value, weight: row.weight };
  });
}

/** Turns the facts into the answer the caller may see: ordering, the row cap, suppression, masking, labels, headline and provenance. */
export function finishMetric(plan: MetricPlan, current: FactResult, comparison: FactResult | null): MetricResult {
  if (!current.ok) return fail(current.code, current.error);
  if (plan.comparison && "ok" in plan.comparison) return plan.comparison;
  if (comparison && !comparison.ok) return fail(comparison.code, comparison.error);
  const { dictionary, def, query, dims, filters, masked, ratio } = plan;
  const all = keyRows(dims, current.rows);
  const suppressed = masked ? new Set<string>() : smallCellKeys(dictionary, def.id, dims, all, filters);
  const where = query.where;
  const aggregated = where ? all.filter((row) => !suppressed.has(row.key) && passes(where, row.value)) : all;
  const compareRows = comparison ? keyRows(dims, comparison.rows).map((row) => ({ ...row, value: row.value * plan.comparisonScale })) : null;

  const limit = query.limit ?? DEFAULT_LIMIT;
  const lowFirst = RISK_WHEN_LOW.has(def.id);
  const capped = query.sort && !masked && !firstTimeDim(dims) ? orderedRows(aggregated, query.sort, limit, compareRows) : sortRows(aggregated, dims, limit, masked, lowFirst);
  const rows = buildRows(dictionary, def, dims, capped, compareRows, masked, suppressed);
  const provenance: Provenance = {
    metric: def.id,
    certified: def.certified,
    sourceSystem: def.sourceSystem,
    asOf: TODAY,
    rowCount: rows.length,
    filtersApplied: filtersToRecord(filters, plan.scopeApplied),
    filterLabels: [...filterLabelsOf(dictionary, filters, dims, plan.scopeApplied), ...(query.where ? [whereLabelOf(def, query.where)] : [])],
    scopeApplied: plan.scopeApplied,
    masked: masked || suppressed.size > 0 ? [...SUPPRESSED_FIELDS] : [],
    trust: def.certified ? "verified" : "derived",
  };
  const headline = headlineOf(dictionary, def, query, capped, aggregated, averagedHeadline(def, query, ratio), compareRows, masked, suppressed, { periodLabel: plan.periodLabel, compareNote: plan.compareNote });
  const summary = summarize(def, query, headline, masked, aggregated.length === 0);
  return {
    ok: true,
    rows,
    summary: suppressed.size > 0 ? `${summary} · ปิด ${suppressed.size} แถวที่รวมข้อมูลน้อยกว่า ${MIN_CELL_SIZE} เอเย่นต์` : summary,
    headline,
    provenance,
  };
}

function passes(where: ValueFilter, value: number): boolean {
  return where.op === "below" ? value < where.value : value > where.value;
}

function whereLabelOf(def: MetricDef, where: ValueFilter): string {
  const amount = def.format === "number" && Number.isInteger(where.value) ? `${formatNumber(where.value, 0)} ${def.unit}` : formatForSummary(def, where.value);
  return `${where.op === "below" ? "น้อยกว่า" : "มากกว่า"} ${amount}`;
}

/** Runs one question against a synchronous fact reader: plan, read, finish. */
export function evaluateMetric(query: MetricQuery, access: AccessContext, dictionary: Dictionary, read: (request: FactRequest) => FactResult): MetricResult {
  const plan = planMetric(query, access, dictionary);
  if ("ok" in plan) return plan;
  const comparison = comparisonRequestOf(plan);
  return finishMetric(plan, read(plan.current), comparison ? read(comparison) : null);
}

export type SeriesQuery = { metric: MetricId; dims: Dim[]; filters: Partial<Record<Dim, string[]>>; range: { from: string; to: string } };

/** The batch plane's request: the same resolution as a question, without access scoping, masking or the row cap. */
export function seriesRequest(query: SeriesQuery, dictionary: Dictionary): FactRequest | null {
  const def = metricDef(query.metric);
  if (!def) return null;
  const full: MetricQuery = { ...query, grain: "day", compare: "none", limit: null };
  const range = rangeDays(full);
  if ("ok" in range) return null;
  const filters = normalizeFilters(full, def, dictionary);
  if ("ok" in filters) return null;
  return factRequest(def, "actual", dedupe(query.dims), filters, range.from, range.to, NO_SHIFT);
}
