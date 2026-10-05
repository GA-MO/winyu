import type { CalendarEvent, CalendarEventKind, DateWindow, Holiday } from "@/lib/contracts";

export type CalendarRecords = { holidays: readonly Holiday[]; alcoholBanDates: readonly string[]; festivals: readonly DateWindow[] };

/** The company calendar: public holidays, the days alcohol may not be sold and the festival windows. */
export type CalendarPort = { load(): Promise<CalendarRecords> };

/** One loaded calendar with the lookups the tools, leave and the impact engine need. */
export type Calendar = {
  events(from: string, to: string): CalendarEvent[];
  holidayOn(iso: string): Holiday | null;
  isAlcoholBanDay(iso: string): boolean;
};

export function calendarOf(records: CalendarRecords): Calendar {
  const holidays = new Map(records.holidays.map((holiday) => [holiday.date, holiday]));
  const bans = new Set(records.alcoholBanDates);
  const events = (from: string, to: string) => {
    const found: CalendarEvent[] = [];
    for (const holiday of records.holidays) {
      if (holiday.date < from || holiday.date > to) continue;
      const kind: CalendarEventKind = bans.has(holiday.date) ? "alcohol_ban" : "holiday";
      found.push({ from: holiday.date, to: holiday.date, nameTh: holiday.nameTh, kind });
    }
    for (const window of records.festivals) {
      if (window.to < from || window.from > to) continue;
      found.push({ from: window.from, to: window.to, nameTh: window.nameTh, kind: "festival" });
    }
    return found.sort((left, right) => left.from.localeCompare(right.from) || left.kind.localeCompare(right.kind));
  };
  return { events, holidayOn: (iso) => holidays.get(iso) ?? null, isAlcoholBanDay: (iso) => bans.has(iso) };
}
