import type { MetricQuery, WidgetSpec } from "@/lib/contracts";
import { DATA_AS_OF, addDays, monthEnd, monthStart } from "@/lib/data/dates";

type Range = MetricQuery["range"];

const DAY_MS = 86_400_000;

function lengthOf(range: Range): number {
  return Math.round((Date.parse(range.to) - Date.parse(range.from)) / DAY_MS) + 1;
}

function wholeMonthsBack(range: Range, pinnedOn: string): number | null {
  if (range.from !== monthStart(range.from) || range.to !== monthEnd(pinnedOn, 1)) return null;
  const [fromYear, fromMonth] = range.from.split("-").map(Number);
  const [toYear, toMonth] = range.to.split("-").map(Number);
  return ((toYear ?? 0) - (fromYear ?? 0)) * 12 + (toMonth ?? 0) - (fromMonth ?? 0) + 1;
}

/**
 * The range a pinned card shows today, from the range it was pinned with: one that ran up to the day it was pinned keeps running up to the
 * data's latest day (month- and year-to-date stay so, "last 4 weeks" stays four weeks), the last whole month(s) stay the last whole month(s),
 * and a range that was history when pinned (a past campaign) stays put.
 */
export function rolledRange(range: Range, pinnedOn: string, today: string = DATA_AS_OF): Range {
  if (range.to >= addDays(pinnedOn, -1)) {
    if (range.from === monthStart(range.to)) return { from: monthStart(today), to: today };
    if (range.from === `${range.to.slice(0, 4)}-01-01`) return { from: `${today.slice(0, 4)}-01-01`, to: today };
    return { from: addDays(today, 1 - lengthOf(range)), to: today };
  }
  const months = wholeMonthsBack(range, pinnedOn);
  if (months !== null) return { from: monthStart(today, months), to: monthEnd(today, 1) };
  return range;
}

/** A pinned or suggested card as it should read today; starter cards follow the role template, which is already written against today. */
export function liveWidget(widget: WidgetSpec, today: string = DATA_AS_OF): WidgetSpec {
  if (widget.source === "role_template") return widget;
  const range = rolledRange(widget.query.range, widget.createdAt.slice(0, 10), today);
  return range === widget.query.range ? widget : { ...widget, query: { ...widget.query, range } };
}
