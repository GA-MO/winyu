import type { ActionEvent, Alert, OutboxEntry, PersonalWatch, RoleId, WidgetSpec } from "@/lib/contracts";
import type { Matter } from "@/lib/share/matter";
import { ROLE_IDS } from "@/lib/contracts";
import { USERS } from "@/lib/data/entities/users";
import { thresholdKey } from "@/lib/engine/anomaly";
import { actionEvents, alerts, layouts, outbox, personalWatches } from "./agent/collections";
import { shares } from "./share/shares";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const ACTIVE_DAYS = 7;
const VIEW_DAYS = 14;
const PERCENT = 100;

export type RoleActivity = { role: RoleId; active: number; total: number };
export type AlertFate = { total: number; handedOff: number; closed: number; opened: number; untouched: number };
export type MatterFlow = { total: number; done: number; passedOn: number; medianHoursToAnswer: number | null };
export type CardUse = { pinned: number; viewed: number; judged: boolean };
export type WatchUse = { active: number; triggered: number; notified: number; digests: number };

/** Whether Winyu is actually used: who came back, what happened to the alerts, whether matters that ask for an answer got one, which cards are read, what runs on its own. */
export type AdoptionSummary = { activeByRole: RoleActivity[]; alerts: AlertFate; matters: MatterFlow; cards: CardUse; watches: WatchUse };

export type AdoptionInput = {
  events: readonly ActionEvent[];
  alerts: readonly Alert[];
  matters: readonly Matter[];
  widgets: readonly WidgetSpec[];
  watches: readonly PersonalWatch[];
  outbox: readonly OutboxEntry[];
};

function within(iso: string, days: number, now: number): boolean {
  return now - Date.parse(iso) <= days * DAY_MS;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function activeByRole(events: readonly ActionEvent[], now: number): RoleActivity[] {
  const active = new Set(events.filter((event) => within(event.at, ACTIVE_DAYS, now)).map((event) => event.userId));
  return ROLE_IDS.map((role) => {
    const people = USERS.filter((user) => user.role === role);
    return { role, active: people.filter((user) => active.has(user.id)).length, total: people.length };
  }).filter((entry) => entry.total > 0);
}

function alertFate(input: AdoptionInput): AlertFate {
  const handed = new Set(input.matters.flatMap((matter) => matter.alertIds));
  const touched = new Set(input.events.filter((event) => event.kind === "alert_open" || event.kind === "dismiss").map((event) => event.intentKey));
  const fate: AlertFate = { total: input.alerts.length, handedOff: 0, closed: 0, opened: 0, untouched: 0 };
  for (const alert of input.alerts) {
    if (handed.has(alert.id)) fate.handedOff += 1;
    else if (alert.status === "dismissed" || alert.status === "resolved") fate.closed += 1;
    else if (touched.has(`alert:${thresholdKey(alert.metric, alert.dims)}`)) fate.opened += 1;
    else fate.untouched += 1;
  }
  return fate;
}

function hoursToFirstAnswer(matter: Matter): number | null {
  const answer = matter.thread.find((line) => line.userId !== null && line.userId !== matter.senderId);
  return answer ? (Date.parse(answer.at) - Date.parse(matter.at)) / HOUR_MS : null;
}

function matterFlow(all: readonly Matter[]): MatterFlow {
  const asking = all.filter((matter) => matter.intent === "act");
  const waits = asking.map(hoursToFirstAnswer).filter((hours): hours is number => hours !== null && hours >= 0);
  return {
    total: asking.length,
    done: asking.filter((matter) => matter.status === "done").length,
    passedOn: asking.filter((matter) => matter.path.some((hop) => hop.state === "passed_on")).length,
    medianHoursToAnswer: median(waits),
  };
}

function cardUse(input: AdoptionInput, now: number): CardUse {
  const viewers = new Set(input.events.filter((event) => event.kind === "widget_view").map((event) => event.userId));
  const pinned = input.widgets.filter((widget) => widget.pinned && viewers.has(widget.userId));
  const seen = new Set(input.events.filter((event) => event.kind === "widget_view" && within(event.at, VIEW_DAYS, now)).map((event) => event.intentKey));
  return { pinned: pinned.length, viewed: pinned.filter((widget) => seen.has(`widget:${widget.id}`)).length, judged: viewers.size > 0 };
}

/** Pure over its input so the numbers can be tested; `adoptionSummary` feeds it the store. */
export function adoptionOf(input: AdoptionInput, now = Date.now()): AdoptionSummary {
  return {
    activeByRole: activeByRole(input.events, now),
    alerts: alertFate(input),
    matters: matterFlow(input.matters),
    cards: cardUse(input, now),
    watches: {
      active: input.watches.length,
      triggered: input.watches.filter((watch) => watch.state === "triggered").length,
      notified: input.outbox.filter((entry) => entry.kind === "watch").length,
      digests: input.outbox.filter((entry) => entry.kind === "digest" && within(entry.at, ACTIVE_DAYS, now)).length,
    },
  };
}

export function adoptionSummary(now = Date.now()): AdoptionSummary {
  return adoptionOf(
    {
      events: actionEvents().all(),
      alerts: alerts().all(),
      matters: shares().all(),
      widgets: layouts().all().flatMap((layout) => layout.widgets),
      watches: personalWatches().all(),
      outbox: outbox().all(),
    },
    now,
  );
}

export function percentOf(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * PERCENT);
}
