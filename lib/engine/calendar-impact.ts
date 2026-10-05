import { addDays, TODAY } from "@/lib/data/dates";
import type { CalendarEvent } from "@/lib/contracts";
import type { Calendar } from "@/lib/server/ports/calendar";

const NORMAL_WEEKS = 4;
const DAYS_PER_WEEK = 7;
const EVE_DAYS = 2;
const PERCENT = 100;

/** Daily beer volume by ISO date for the caller's scope, or null when the caller may not see it. */
export type DailyBeer = (metric: "sell_out_volume" | "net_sales_volume", from: string, to: string) => Promise<ReadonlyMap<string, number> | null>;

export type EventImpact = { reference: CalendarEvent; sellOutPercent: number | null; orderEvePercent: number | null };

function percentChange(actual: number, normal: number): number | null {
  if (normal <= 0) return null;
  return Math.round(((actual - normal) / normal) * PERCENT);
}

function nearAnyBan(iso: string, calendar: Calendar): boolean {
  for (let offset = 0; offset <= EVE_DAYS; offset += 1) if (calendar.isAlcoholBanDay(addDays(iso, offset))) return true;
  return false;
}

function sameWeekdayNormal(values: ReadonlyMap<string, number>, iso: string, calendar: Calendar): number {
  let sum = 0;
  let count = 0;
  for (let week = 1; week <= NORMAL_WEEKS; week += 1) {
    const earlier = addDays(iso, -week * DAYS_PER_WEEK);
    const value = values.get(earlier);
    if (value === undefined || nearAnyBan(earlier, calendar)) continue;
    sum += value;
    count += 1;
  }
  return count === 0 ? 0 : sum / count;
}

function dailyMean(values: ReadonlyMap<string, number>, from: string, to: string, calendar: Calendar): number {
  let sum = 0;
  let count = 0;
  for (let iso = from; iso <= to; iso = addDays(iso, 1)) {
    if (nearAnyBan(iso, calendar)) continue;
    sum += values.get(iso) ?? 0;
    count += 1;
  }
  return count === 0 ? 0 : sum / count;
}

function hasOrdinaryEve(day: string, calendar: Calendar): boolean {
  for (let offset = 1; offset <= EVE_DAYS; offset += 1) {
    const eve = addDays(day, -offset);
    if (calendar.isAlcoholBanDay(eve) || calendar.holidayOn(eve) !== null) return false;
  }
  return true;
}

function lastPast(event: CalendarEvent, calendar: Calendar): CalendarEvent | null {
  const lookFrom = addDays(TODAY, -2 * 366);
  const past = calendar.events(lookFrom, addDays(TODAY, -1)).filter((candidate) => candidate.to < TODAY && candidate.kind === event.kind);
  if (event.kind === "alcohol_ban") return past.filter((candidate) => hasOrdinaryEve(candidate.from, calendar)).at(-1) ?? null;
  return past.filter((candidate) => candidate.nameTh.split(" ")[0] === event.nameTh.split(" ")[0]).at(-1) ?? null;
}

async function banImpact(reference: CalendarEvent, beer: DailyBeer, calendar: Calendar): Promise<EventImpact | null> {
  const day = reference.from;
  const from = addDays(day, -(NORMAL_WEEKS * DAYS_PER_WEEK + EVE_DAYS));
  const [sellOut, sellIn] = await Promise.all([beer("sell_out_volume", from, day), beer("net_sales_volume", from, day)]);
  if (!sellOut || !sellIn) return null;
  const outPercent = percentChange(sellOut.get(day) ?? 0, sameWeekdayNormal(sellOut, day, calendar));
  let eveActual = 0;
  let eveNormal = 0;
  for (let offset = 1; offset <= EVE_DAYS; offset += 1) {
    const eve = addDays(day, -offset);
    eveActual += sellIn.get(eve) ?? 0;
    eveNormal += sameWeekdayNormal(sellIn, eve, calendar);
  }
  return { reference, sellOutPercent: outPercent, orderEvePercent: percentChange(eveActual, eveNormal) };
}

async function windowImpact(reference: CalendarEvent, beer: DailyBeer, calendar: Calendar): Promise<EventImpact | null> {
  const before = addDays(reference.from, -NORMAL_WEEKS * DAYS_PER_WEEK);
  const sellOut = await beer("sell_out_volume", before, reference.to);
  if (!sellOut) return null;
  const singleDay = reference.from === reference.to;
  const during = singleDay ? (sellOut.get(reference.from) ?? 0) : dailyMean(sellOut, reference.from, reference.to, calendar);
  const normal = singleDay ? sameWeekdayNormal(sellOut, reference.from, calendar) : dailyMean(sellOut, before, addDays(reference.from, -1), calendar);
  return { reference, sellOutPercent: percentChange(during, normal), orderEvePercent: null };
}

/** What the most recent comparable event did to beer volume in the caller's scope, measured from data; null when there is no past event or no access. */
export async function impactOf(event: CalendarEvent, beer: DailyBeer, calendar: Calendar): Promise<EventImpact | null> {
  const reference = event.to < TODAY ? event : lastPast(event, calendar);
  if (!reference) return null;
  if (reference.kind === "alcohol_ban") return banImpact(reference, beer, calendar);
  return windowImpact(reference, beer, calendar);
}
