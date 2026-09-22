const LOCALE = "th-TH";
const BUDDHIST_LOCALE = "th-TH-u-ca-buddhist";
const CURRENCY = "บาท";
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const COMPACT_THRESHOLD = 1_000_000;
const MASKED = "***";

const numberFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const compactFormat = new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 });
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
  return Math.abs(numeric) >= COMPACT_THRESHOLD ? compactFormat.format(numeric) : numberFormat.format(numeric);
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

const MORNING_END = 12;
const AFTERNOON_END = 17;
const EVENING_END = 21;

export function timeOfDay(now: Date = new Date()): TimeOfDay {
  const hour = now.getHours();
  if (hour < MORNING_END) return "morning";
  if (hour < AFTERNOON_END) return "afternoon";
  if (hour < EVENING_END) return "evening";
  return "night";
}

/** "คุณอนุชา พรหมศรี" → "คุณอนุชา": the form the agent greets people with. */
export function shortName(nameTh: string): string {
  return nameTh.split(" ")[0] ?? nameTh;
}
