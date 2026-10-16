import { addDays } from "@/lib/data/dates";

const WEEKDAYS: readonly string[] = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"];
const DAYS_IN_WEEK = 7;
const FRIDAY = 5;
const BY = "(?:ภายใน|ก่อน|ไม่เกิน|ให้ทัน|ถึง)\\s*";
const WORKDAY_WORD = "(จันทร์|อังคาร|พุธ|พฤหัส(?:บดี)?|ศุกร์|เสาร์)";
const BY_TODAY = new RegExp(`${BY}(?:วันนี้|เย็นนี้|บ่ายนี้|คืนนี้)|ก่อนเลิกงาน|เย็นนี้|บ่ายนี้`);
const TOMORROW = /พรุ่งนี้/;
const DAY_AFTER_TOMORROW = /มะรืน/;
const THIS_WEEK = /(?<!วัน)(?:สัปดาห์|อาทิตย์)นี้|ภายใน(?:สัปดาห์|อาทิตย์)(?!หน้า)/;
const NEXT_WEEK = /(?<!วัน)(?:สัปดาห์|อาทิตย์)หน้า/;
const BY_WEEKDAY = new RegExp(`${BY}(?:วัน)?${WORKDAY_WORD}|${BY}วัน(อาทิตย์)|(?:วัน)?${WORKDAY_WORD}นี้|วัน(อาทิตย์)นี้`);
const BY_DATE = new RegExp(`${BY}วันที่\\s*(\\d{1,2})`);

/** A deadline the sender wrote, as the day it falls on (Bangkok, YYYY-MM-DD) or, for "this week", no single day. */
export type WrittenDeadline = { kind: "day"; day: string } | { kind: "this_week" };

function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

function nextWeekday(today: string, word: string): string {
  const target = WEEKDAYS.findIndex((name) => word.startsWith(name));
  return addDays(today, (target - weekdayOf(today) + DAYS_IN_WEEK) % DAYS_IN_WEEK);
}

function nextDate(today: string, dayOfMonth: number): string {
  const [year, month] = today.split("-").map(Number);
  const thisMonth = `${year}-${String(month).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;
  if (thisMonth >= today) return thisMonth;
  const next = new Date(Date.UTC(year ?? 1970, month ?? 1, dayOfMonth));
  return next.toISOString().slice(0, 10);
}

function fridayNextWeek(today: string): string {
  return addDays(today, ((FRIDAY - weekdayOf(today) + DAYS_IN_WEEK) % DAYS_IN_WEEK) + DAYS_IN_WEEK);
}

/** The deadline the sender's own words set (ภายในวันนี้, พรุ่งนี้, มะรืน, ภายในศุกร์นี้, ก่อนศุกร์, ภายในวันที่ 20, สัปดาห์นี้, สัปดาห์หน้า), counted from `today`; null when they set none. */
export function writtenDeadline(text: string, today: string): WrittenDeadline | null {
  if (BY_TODAY.test(text)) return { kind: "day", day: today };
  if (DAY_AFTER_TOMORROW.test(text)) return { kind: "day", day: addDays(today, 2) };
  if (TOMORROW.test(text)) return { kind: "day", day: addDays(today, 1) };
  const date = BY_DATE.exec(text);
  if (date) return { kind: "day", day: nextDate(today, Number(date[1])) };
  const weekday = BY_WEEKDAY.exec(text)?.slice(1).find((group) => group !== undefined);
  if (weekday) return { kind: "day", day: nextWeekday(today, weekday) };
  if (NEXT_WEEK.test(text)) return { kind: "day", day: fridayNextWeek(today) };
  return THIS_WEEK.test(text) ? { kind: "this_week" } : null;
}
