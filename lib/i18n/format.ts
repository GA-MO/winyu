const LOCALE = "th-TH";
const BUDDHIST_LOCALE = "th-TH-u-ca-buddhist";
const CURRENCY = "บาท";
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MASKED = "***";

const WHOLE_FROM = 100;
const MILLION = 1_000_000;
const numberFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const wholeFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const percentFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat(BUDDHIST_LOCALE, { day: "numeric", month: "short", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit" });

function isMasked(value: unknown): boolean {
  return typeof value === "string" && value.includes(MASKED);
}

export function formatNumber(value: number | string | null): string {
  if (value === null) return "—";
  if (isMasked(value)) return MASKED;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  const size = Math.abs(numeric);
  if (size >= MILLION) return `${numberFormat.format(numeric / MILLION)} ล้าน`;
  return size >= WHOLE_FROM ? wholeFormat.format(numeric) : numberFormat.format(numeric);
}

export function formatCurrency(value: number | string | null): string {
  if (value === null) return "—";
  if (isMasked(value)) return MASKED;
  return `${formatNumber(value)} ${CURRENCY}`;
}

export function formatPercent(value: number | string | null): string {
  if (value === null) return "—";
  if (isMasked(value)) return MASKED;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return `${percentFormat.format(numeric)}%`;
}

/** A Thai date in พ.ศ. ("22 ก.ย. 2569"); an unparsable value comes back untouched. */
export function formatDateTh(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return dateFormat.format(date);
}

export function formatTimeTh(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return timeFormat.format(date);
}

export function relativeTimeTh(value: string | Date, now: Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const elapsed = now.getTime() - date.getTime();
  if (elapsed < MINUTE_MS) return "เมื่อสักครู่";
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)} นาทีที่แล้ว`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)} ชั่วโมงที่แล้ว`;
  if (elapsed < 2 * DAY_MS) return "เมื่อวาน";
  if (elapsed < WEEK_MS) return `${Math.floor(elapsed / DAY_MS)} วันที่แล้ว`;
  return formatDateTh(date);
}

export type ThreadGroup = "today" | "yesterday" | "week" | "older";

export function threadGroupOf(value: string, now: Date = new Date()): ThreadGroup {
  const elapsed = now.getTime() - new Date(value).getTime();
  if (elapsed < DAY_MS) return "today";
  if (elapsed < 2 * DAY_MS) return "yesterday";
  if (elapsed < WEEK_MS) return "week";
  return "older";
}

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

const TENANT_UTC_OFFSET_HOURS = 7;
const HOURS_PER_DAY = 24;
const MORNING_FROM = 5;
const AFTERNOON_FROM = 12;
const EVENING_FROM = 16;
const NIGHT_FROM = 19;

function tenantHour(now: Date): number {
  return (now.getUTCHours() + TENANT_UTC_OFFSET_HOURS) % HOURS_PER_DAY;
}

/** The part of the day in Thailand, whatever timezone the server runs in. */
export function timeOfDay(now: Date = new Date()): TimeOfDay {
  const hour = tenantHour(now);
  if (hour < MORNING_FROM || hour >= NIGHT_FROM) return "night";
  if (hour < AFTERNOON_FROM) return "morning";
  if (hour < EVENING_FROM) return "afternoon";
  return "evening";
}

const THAI_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const THAI_YEAR_OFFSET = 543;
const SHORT_YEAR_MODULO = 100;
const WEEK_KEY = /^(\d{4})-W(\d{2})$/;
const MONTH_KEY = /^(\d{4})-(\d{2})$/;
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

function thaiShortYear(year: number): string {
  return String((year + THAI_YEAR_OFFSET) % SHORT_YEAR_MODULO).padStart(2, "0");
}

function thaiMonth(month: number): string {
  return THAI_MONTHS_SHORT[month - 1] ?? String(month);
}

/** "2026-W38" → "สัปดาห์ 38", "2026-08" → "ส.ค. 69", "2026-09-22" → "22 ก.ย."; anything else is returned untouched. */
export function periodLabelTh(key: string): string {
  const week = WEEK_KEY.exec(key);
  if (week) return `สัปดาห์ ${Number(week[2])}`;
  const date = DATE_KEY.exec(key);
  if (date) return `${Number(date[3])} ${thaiMonth(Number(date[2]))}`;
  const month = MONTH_KEY.exec(key);
  if (month) return `${thaiMonth(Number(month[2]))} ${thaiShortYear(Number(month[1]))}`;
  return key;
}

/** "คุณอนุชา พรหมศรี" → "คุณอนุชา": the form the agent greets people with. */
export function shortName(nameTh: string): string {
  return nameTh.split(" ")[0] ?? nameTh;
}

const THAI_THEN_LATIN = /([\u0E00-\u0E7F])([A-Za-z0-9(])/g;
const LATIN_THEN_THAI = /([A-Za-z0-9)])([\u0E00-\u0E7F])/g;

/** Puts a space where Thai text meets a Latin word or number, the way Thai writers set English terms apart. */
export function spaceLatinTh(text: string): string {
  return text.replace(THAI_THEN_LATIN, "$1 $2").replace(LATIN_THEN_THAI, "$1 $2");
}
