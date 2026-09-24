import type { z } from "zod";
import { getCalendarInputSchema, type AccessContext } from "@/lib/contracts";
import { addDays, TODAY, toDayIndex } from "@/lib/data/dates";
import { calendarEvents, type CalendarEvent } from "@/lib/data/entities/calendar";
import { impactOf, type DailyBeer, type EventImpact } from "@/lib/engine/calendar-impact";
import { formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { dataPort } from "@/lib/server/agent/data-port";
import { currentAccess } from "@/lib/server/request-context";
import { defineTool } from "./define";

const CALENDAR_DEFAULT_DAYS = 60;
const CALENDAR_MAX_ROWS = 20;
const CALENDAR_DAILY_LIMIT = 60;

function beerFor(access: AccessContext): DailyBeer {
  return (metric, from, to) => {
    const result = dataPort().runMetric(
      { metric, dims: ["date"], filters: { business_unit: ["beer"] }, range: { from, to }, grain: "day", compare: "none", limit: CALENDAR_DAILY_LIMIT },
      access,
    );
    if (!result.ok) return null;
    return new Map(result.rows.map((row) => [String(row.date), Number(row.value)]));
  };
}

function impactLabel(impact: EventImpact | null): string {
  if (!impact || impact.sellOutPercent === null) return TH.calendar.noImpact;
  const parts = [TH.calendar.sellOut(impact.sellOutPercent)];
  if (impact.orderEvePercent !== null) parts.push(TH.calendar.orderEve(impact.orderEvePercent));
  parts.push(TH.calendar.basis(impact.reference.nameTh, formatDateTh(impact.reference.from)));
  return parts.join(" · ");
}

function dateSpanLabel(event: CalendarEvent): string {
  return event.from === event.to ? formatDateTh(event.from) : `${formatDateTh(event.from)} – ${formatDateTh(event.to)}`;
}

export const getCalendarTool = defineTool({
  name: "get_calendar",
  connector: "calendar",
  tier: "read",
  roles: "all",
  description: "List no-alcohol-sale days (Buddhist holy days), public holidays and festivals in a date range, each with what the last comparable event did to beer volume in the user's scope, measured from data. Call it when the user asks what is coming up, why sales dipped on a day, or how to plan orders around a holiday. from/to default to today and 60 days ahead.",
  input: getCalendarInputSchema,
  execute: async ({ from, to }: z.infer<typeof getCalendarInputSchema>) => {
    const access = currentAccess();
    const start = from ?? TODAY;
    const end = to ?? addDays(start, CALENDAR_DEFAULT_DAYS);
    const events = calendarEvents(start, end).slice(0, CALENDAR_MAX_ROWS);
    if (events.length === 0) return { ok: true as const, summary: TH.calendar.none(formatDateTh(start), formatDateTh(end)), data: [] };
    const beer = beerFor(access);
    const rows = events.map((event) => ({
      date: event.from,
      date_label: dateSpanLabel(event),
      when_label: TH.calendar.inDays(toDayIndex(event.from) - toDayIndex(TODAY)),
      name: event.nameTh,
      kind: event.kind,
      kind_label: TH.calendar.kind[event.kind],
      impact_label: impactLabel(impactOf(event, beer)),
    }));
    const bans = events.filter((event) => event.kind === "alcohol_ban").length;
    return { ok: true as const, summary: TH.calendar.summary(events.length, formatDateTh(start), formatDateTh(end), bans), data: rows };
  },
});
