import { relativeTimeTh, threadGroupOf, type ThreadGroup } from "@/lib/i18n/format";
import type { GivenGrant, ReceivedState, SentState, ShareLine } from "@/lib/share/card";

export const PAGE_SIZE = 20;
export const SHARED_TABS = ["received", "sent"] as const;
const RECENT_GROUPS: readonly ThreadGroup[] = ["today", "yesterday", "week"];
const TAB_PARAM = "tab";

export type SharedTab = (typeof SHARED_TABS)[number];
type AnyState = ReceivedState | SentState;

/** Shares of one card between the same people, collapsed: the most recently active one speaks for the row. */
export type ShareGroup<S extends AnyState> = { key: string; latest: ShareLine<S>; count: number; lastSentAt: string; activityAt: string; unread: boolean; grants: GivenGrant[] };

/** Rows under one day heading. */
export type DaySection<S extends AnyState> = { group: ThreadGroup; rows: ShareGroup<S>[] };

/** A tab's list as drawn: recent rows under their day headings up to one page, how many wait behind ดูเพิ่ม, and the Older rows. */
export type ShareListView<S extends AnyState> = { days: DaySection<S>[]; hiddenRecent: number; older: ShareGroup<S>[] };

function keyOf(line: ShareLine<AnyState>): string {
  const people = line.people.map((person) => person.id).sort().join(",");
  return `${line.title}|${people}`;
}

function latestOf(left: string, right: string): string {
  return right > left ? right : left;
}

/** One row per card and set of people, sorted by latest activity: repeats count, the most recently active share speaks for the row, and every live grant on them stays reachable. */
export function collapseRepeats<S extends AnyState>(lines: readonly ShareLine<S>[]): ShareGroup<S>[] {
  const groups = new Map<string, ShareLine<S>[]>();
  for (const line of lines) groups.set(keyOf(line), [...(groups.get(keyOf(line)) ?? []), line]);
  return [...groups.entries()]
    .map(([key, members]) => {
      const [latest] = [...members].sort((left, right) => right.activityAt.localeCompare(left.activityAt));
      return {
        key,
        latest,
        count: members.length,
        lastSentAt: members.map((line) => line.sentAt).reduce(latestOf),
        activityAt: latest.activityAt,
        unread: members.some((line) => line.unread),
        grants: members.flatMap((line) => line.grants),
      };
    })
    .sort((left, right) => right.activityAt.localeCompare(left.activityAt));
}

/** Rows bucketed by the day of their latest activity: Today, Yesterday and Previous 7 days share one page of twenty (all of them once expanded), Older is kept apart. */
export function dayList<S extends AnyState>(groups: readonly ShareGroup<S>[], now: Date, expanded: boolean): ShareListView<S> {
  const recent = groups.filter((group) => threadGroupOf(group.activityAt, now) !== "older");
  const older = groups.filter((group) => threadGroupOf(group.activityAt, now) === "older");
  const shown = expanded ? recent : recent.slice(0, PAGE_SIZE);
  const days = RECENT_GROUPS.map((group) => ({ group, rows: shown.filter((row) => threadGroupOf(row.activityAt, now) === group) })).filter((section) => section.rows.length > 0);
  return { days, hiddenRecent: recent.length - shown.length, older };
}

/** When a repeated row was last sent, as words; null when it was sent once or the time already reads the same as the row's activity time. */
export function lastSentLabel(group: ShareGroup<AnyState>, now: Date): string | null {
  if (group.count === 1) return null;
  const sent = relativeTimeTh(group.lastSentAt, now);
  return sent === relativeTimeTh(group.activityAt, now) ? null : sent;
}

/** Search is offered once a tab holds more rows than one page. */
export function offersSearch(groups: readonly ShareGroup<AnyState>[]): boolean {
  return groups.length > PAGE_SIZE;
}

/** Rows whose card title or person name holds the query, ignoring case and spacing at the ends. */
export function searchGroups<S extends AnyState>(groups: readonly ShareGroup<S>[], query: string): ShareGroup<S>[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...groups];
  return groups.filter((group) => group.latest.title.toLowerCase().includes(needle) || group.latest.people.some((person) => person.name.toLowerCase().includes(needle)));
}

/** Only rows that still hold a live grant the viewer gave. */
export function withLiveGrants<S extends AnyState>(groups: readonly ShareGroup<S>[]): ShareGroup<S>[] {
  return groups.filter((group) => group.grants.length > 0);
}

/** The tab a `?tab=` value names; anything else is ส่งถึงฉัน. */
export function tabOf(value: string | null | undefined): SharedTab {
  return SHARED_TABS.find((tab) => tab === value) ?? "received";
}

/** The query string that keeps a tab in the URL: none for ส่งถึงฉัน, `?tab=sent` for ฉันส่ง. */
export function tabSearch(tab: SharedTab): string {
  return tab === "received" ? "" : `?${TAB_PARAM}=${tab}`;
}
