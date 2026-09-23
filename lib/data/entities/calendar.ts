import { DAY_COUNT, ISO_OF_DAY, toBuddhistYear, toDayIndex, weekKeyOfIso } from "../dates";

export type Holiday = { date: string; nameTh: string; label: string };
export type DateWindow = { from: string; to: string; nameTh: string };

export const FISCAL_YEAR_START_MONTH = 1;

export const THAI_HOLIDAYS: readonly Holiday[] = [
  { date: "2025-04-06", nameTh: "วันจักรี", label: "Chakri Day" },
  { date: "2025-04-13", nameTh: "วันสงกรานต์", label: "Songkran" },
  { date: "2025-04-14", nameTh: "วันสงกรานต์", label: "Songkran" },
  { date: "2025-04-15", nameTh: "วันสงกรานต์", label: "Songkran" },
  { date: "2025-05-01", nameTh: "วันแรงงานแห่งชาติ", label: "Labour Day" },
  { date: "2025-05-04", nameTh: "วันฉัตรมงคล", label: "Coronation Day" },
  { date: "2025-05-11", nameTh: "วันวิสาขบูชา", label: "Visakha Bucha" },
  { date: "2025-06-03", nameTh: "วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี", label: "Queen's Birthday" },
  { date: "2025-07-10", nameTh: "วันอาสาฬหบูชา", label: "Asarnha Bucha" },
  { date: "2025-07-11", nameTh: "วันเข้าพรรษา", label: "Buddhist Lent Day" },
  { date: "2025-07-28", nameTh: "วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว", label: "King's Birthday" },
  { date: "2025-08-12", nameTh: "วันแม่แห่งชาติ", label: "Mother's Day" },
  { date: "2025-10-07", nameTh: "วันออกพรรษา", label: "End of Buddhist Lent" },
  { date: "2025-10-13", nameTh: "วันคล้ายวันสวรรคต รัชกาลที่ 9", label: "King Bhumibol Memorial Day" },
  { date: "2025-10-23", nameTh: "วันปิยมหาราช", label: "Chulalongkorn Day" },
  { date: "2025-11-05", nameTh: "วันลอยกระทง", label: "Loy Krathong" },
  { date: "2025-12-05", nameTh: "วันพ่อแห่งชาติ", label: "Father's Day" },
  { date: "2025-12-10", nameTh: "วันรัฐธรรมนูญ", label: "Constitution Day" },
  { date: "2025-12-31", nameTh: "วันสิ้นปี", label: "New Year's Eve" },
  { date: "2026-01-01", nameTh: "วันขึ้นปีใหม่", label: "New Year's Day" },
  { date: "2026-02-17", nameTh: "วันตรุษจีน", label: "Chinese New Year" },
  { date: "2026-03-03", nameTh: "วันมาฆบูชา", label: "Makha Bucha" },
  { date: "2026-04-06", nameTh: "วันจักรี", label: "Chakri Day" },
  { date: "2026-04-13", nameTh: "วันสงกรานต์", label: "Songkran" },
  { date: "2026-04-14", nameTh: "วันสงกรานต์", label: "Songkran" },
  { date: "2026-04-15", nameTh: "วันสงกรานต์", label: "Songkran" },
  { date: "2026-05-01", nameTh: "วันแรงงานแห่งชาติ", label: "Labour Day" },
  { date: "2026-05-04", nameTh: "วันฉัตรมงคล", label: "Coronation Day" },
  { date: "2026-05-31", nameTh: "วันวิสาขบูชา", label: "Visakha Bucha" },
  { date: "2026-06-03", nameTh: "วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี", label: "Queen's Birthday" },
  { date: "2026-07-28", nameTh: "วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว", label: "King's Birthday" },
  { date: "2026-07-29", nameTh: "วันอาสาฬหบูชา", label: "Asarnha Bucha" },
  { date: "2026-07-30", nameTh: "วันเข้าพรรษา", label: "Buddhist Lent Day" },
  { date: "2026-08-12", nameTh: "วันแม่แห่งชาติ", label: "Mother's Day" },
  { date: "2026-10-13", nameTh: "วันคล้ายวันสวรรคต รัชกาลที่ 9", label: "King Bhumibol Memorial Day" },
  { date: "2026-10-23", nameTh: "วันปิยมหาราช", label: "Chulalongkorn Day" },
  { date: "2026-10-26", nameTh: "วันออกพรรษา", label: "End of Buddhist Lent" },
  { date: "2026-11-24", nameTh: "วันลอยกระทง", label: "Loy Krathong" },
  { date: "2026-12-05", nameTh: "วันพ่อแห่งชาติ", label: "Father's Day" },
  { date: "2026-12-10", nameTh: "วันรัฐธรรมนูญ", label: "Constitution Day" },
  { date: "2026-12-31", nameTh: "วันสิ้นปี", label: "New Year's Eve" },
];

/** Buddhist holy days on which selling alcohol is prohibited; beer sell-out nearly stops, water and soda do not. */
export const ALCOHOL_BAN_DATES: readonly string[] = [
  "2025-05-11", "2025-07-10", "2025-07-11", "2025-10-07",
  "2026-03-03", "2026-05-31", "2026-07-29", "2026-07-30", "2026-10-26",
];

export type CalendarEventKind = "alcohol_ban" | "holiday" | "festival";
export type CalendarEvent = { from: string; to: string; nameTh: string; kind: CalendarEventKind };

export const SONGKRAN_WINDOWS: readonly DateWindow[] = [
  { from: "2025-04-11", to: "2025-04-17", nameTh: "สงกรานต์ 2568" },
  { from: "2026-04-11", to: "2026-04-17", nameTh: "สงกรานต์ 2569" },
];

export const BUDDHIST_LENT_WINDOWS: readonly DateWindow[] = [
  { from: "2025-07-11", to: "2025-10-07", nameTh: "เข้าพรรษา 2568" },
  { from: "2026-07-30", to: "2026-10-26", nameTh: "เข้าพรรษา 2569" },
];

const HOLIDAY_BY_DATE: ReadonlyMap<string, Holiday> = new Map(THAI_HOLIDAYS.map((holiday) => [holiday.date, holiday]));

function markWindows(windows: readonly DateWindow[]): Uint8Array {
  const flags = new Uint8Array(DAY_COUNT);
  for (const window of windows) {
    const from = Math.max(0, toDayIndex(window.from));
    const to = Math.min(DAY_COUNT - 1, toDayIndex(window.to));
    for (let day = from; day <= to; day += 1) flags[day] = 1;
  }
  return flags;
}

export const SONGKRAN_FLAGS = markWindows(SONGKRAN_WINDOWS);
export const LENT_FLAGS = markWindows(BUDDHIST_LENT_WINDOWS);
export const HOLIDAY_FLAGS = (() => {
  const flags = new Uint8Array(DAY_COUNT);
  for (const holiday of THAI_HOLIDAYS) {
    const day = toDayIndex(holiday.date);
    if (day >= 0 && day < DAY_COUNT) flags[day] = 1;
  }
  return flags;
})();

export const ALCOHOL_BAN_FLAGS = (() => {
  const flags = new Uint8Array(DAY_COUNT);
  for (const date of ALCOHOL_BAN_DATES) {
    const day = toDayIndex(date);
    if (day >= 0 && day < DAY_COUNT) flags[day] = 1;
  }
  return flags;
})();

const FESTIVAL_WINDOWS: readonly DateWindow[] = [
  ...SONGKRAN_WINDOWS,
  { from: "2025-12-24", to: "2026-01-01", nameTh: "เทศกาลปีใหม่ 2569" },
  { from: "2026-12-24", to: "2027-01-01", nameTh: "เทศกาลปีใหม่ 2570" },
];

export function isAlcoholBanDay(iso: string): boolean {
  return ALCOHOL_BAN_DATES.includes(iso);
}

/** Every dated event in a range, earliest first: no-sale days, public holidays and festival windows. */
export function calendarEvents(from: string, to: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const holiday of THAI_HOLIDAYS) {
    if (holiday.date < from || holiday.date > to) continue;
    const kind: CalendarEventKind = isAlcoholBanDay(holiday.date) ? "alcohol_ban" : "holiday";
    events.push({ from: holiday.date, to: holiday.date, nameTh: holiday.nameTh, kind });
  }
  for (const window of FESTIVAL_WINDOWS) {
    if (window.to < from || window.from > to) continue;
    events.push({ from: window.from, to: window.to, nameTh: window.nameTh, kind: "festival" });
  }
  return events.sort((left, right) => left.from.localeCompare(right.from) || left.kind.localeCompare(right.kind));
}

export function isHoliday(iso: string): boolean {
  return HOLIDAY_BY_DATE.has(iso);
}

export function holidayOn(iso: string): Holiday | null {
  return HOLIDAY_BY_DATE.get(iso) ?? null;
}

function withinWindows(windows: readonly DateWindow[], iso: string): boolean {
  return windows.some((window) => window.from <= iso && iso <= window.to);
}

export function isSongkran(iso: string): boolean {
  return withinWindows(SONGKRAN_WINDOWS, iso);
}

export function isBuddhistLent(iso: string): boolean {
  return withinWindows(BUDDHIST_LENT_WINDOWS, iso);
}

/** ISO week key such as "2025-W15". */
export function weekOf(iso: string): string {
  return weekKeyOfIso(iso);
}

export function isoOfDay(dayIndex: number): string {
  return ISO_OF_DAY[dayIndex] ?? ISO_OF_DAY[0] ?? "";
}

export { toBuddhistYear };
