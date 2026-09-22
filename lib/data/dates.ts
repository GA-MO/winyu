export const DATA_START = "2025-04-01";
export const TODAY = "2026-09-22";

const MS_PER_DAY = 86_400_000;
const THAI_YEAR_OFFSET = 543;
const THAI_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function utc(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

const START_MS = utc(DATA_START);
const TODAY_MS = utc(TODAY);

export const DAY_COUNT = Math.round((TODAY_MS - START_MS) / MS_PER_DAY) + 1;

/** Zero-based day offset from DATA_START; negative or past TODAY when out of range. */
export function toDayIndex(iso: string): number {
  return Math.round((utc(iso) - START_MS) / MS_PER_DAY);
}

export function toIso(dayIndex: number): string {
  return new Date(START_MS + dayIndex * MS_PER_DAY).toISOString().slice(0, 10);
}

export function clampDayIndex(dayIndex: number): number {
  if (dayIndex < 0) return 0;
  if (dayIndex > DAY_COUNT - 1) return DAY_COUNT - 1;
  return dayIndex;
}

export function addDays(iso: string, days: number): string {
  return new Date(utc(iso) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

export function monthKeyOfIso(iso: string): string {
  return iso.slice(0, 7);
}

function isoWeekKey(ms: number): string {
  const date = new Date(ms);
  const dayOfWeek = (date.getUTCDay() + 6) % 7;
  const thursday = new Date(ms + (3 - dayOfWeek) * MS_PER_DAY);
  const year = thursday.getUTCFullYear();
  const firstThursday = Date.UTC(year, 0, 4);
  const firstDayOfWeek = (new Date(firstThursday).getUTCDay() + 6) % 7;
  const weekOne = firstThursday - firstDayOfWeek * MS_PER_DAY;
  const week = Math.round((thursday.getTime() - weekOne) / (7 * MS_PER_DAY)) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function weekKeyOfIso(iso: string): string {
  return isoWeekKey(utc(iso));
}

function buildAxis() {
  const monthKeys: string[] = [];
  const weekKeys: string[] = [];
  const monthOfDay = new Int32Array(DAY_COUNT);
  const weekOfDay = new Int32Array(DAY_COUNT);
  const dowOfDay = new Int32Array(DAY_COUNT);
  const dayOfYear = new Int32Array(DAY_COUNT);
  const isoOfDay: string[] = [];
  const monthIndex = new Map<string, number>();
  const weekIndex = new Map<string, number>();
  for (let day = 0; day < DAY_COUNT; day += 1) {
    const ms = START_MS + day * MS_PER_DAY;
    const date = new Date(ms);
    const iso = date.toISOString().slice(0, 10);
    isoOfDay.push(iso);
    const month = iso.slice(0, 7);
    let mIdx = monthIndex.get(month);
    if (mIdx === undefined) {
      mIdx = monthKeys.length;
      monthKeys.push(month);
      monthIndex.set(month, mIdx);
    }
    monthOfDay[day] = mIdx;
    const week = isoWeekKey(ms);
    let wIdx = weekIndex.get(week);
    if (wIdx === undefined) {
      wIdx = weekKeys.length;
      weekKeys.push(week);
      weekIndex.set(week, wIdx);
    }
    weekOfDay[day] = wIdx;
    dowOfDay[day] = date.getUTCDay();
    dayOfYear[day] = Math.round((ms - Date.UTC(date.getUTCFullYear(), 0, 1)) / MS_PER_DAY);
  }
  return { monthKeys, weekKeys, monthOfDay, weekOfDay, dowOfDay, dayOfYear, isoOfDay, monthIndex, weekIndex };
}

const AXIS = buildAxis();

export const MONTH_KEYS: readonly string[] = AXIS.monthKeys;
export const WEEK_KEYS: readonly string[] = AXIS.weekKeys;
export const ISO_OF_DAY: readonly string[] = AXIS.isoOfDay;
export const MONTH_OF_DAY = AXIS.monthOfDay;
export const WEEK_OF_DAY = AXIS.weekOfDay;
export const DOW_OF_DAY = AXIS.dowOfDay;
export const DAY_OF_YEAR = AXIS.dayOfYear;
export const MONTH_COUNT = AXIS.monthKeys.length;
export const WEEK_COUNT = AXIS.weekKeys.length;

export function monthIndexOfKey(key: string): number {
  return AXIS.monthIndex.get(key) ?? -1;
}

export function weekIndexOfKey(key: string): number {
  return AXIS.weekIndex.get(key) ?? -1;
}

const DAYS_PER_MONTH = (() => {
  const counts = new Int32Array(MONTH_COUNT);
  for (let day = 0; day < DAY_COUNT; day += 1) counts[MONTH_OF_DAY[day] as number] += 1;
  return counts;
})();

export function daysInMonthIndex(monthIdx: number): number {
  return DAYS_PER_MONTH[monthIdx] ?? 0;
}

export function toBuddhistYear(gregorianYear: number): number {
  return gregorianYear + THAI_YEAR_OFFSET;
}

/** "22 ก.ย. 2569" — Thai short date with a Buddhist year. */
export function formatThaiDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${THAI_MONTHS_SHORT[(month ?? 1) - 1]} ${toBuddhistYear(year ?? 1970)}`;
}

export function formatThaiMonth(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return `${THAI_MONTHS_SHORT[(month ?? 1) - 1]} ${toBuddhistYear(year ?? 1970)}`;
}
