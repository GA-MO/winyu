export const PAGE_SIZE = 20;
export const OLDER_AFTER_DAYS = 30;
const DAY_MS = 86_400_000;

export type ScalePerson = { id: string; name: string; photo: string | null };

/** A grant the viewer gave on a sent share, live or not: Shared only offers to revoke the live ones. */
export type ScaleGrant = { id: string; recipientName: string; slice: string; until: string; expiresAt: string };

/** Where a received share stands for its reader, latest event first. */
export type ReceivedState =
  | { kind: "granted"; until: string; at: string }
  | { kind: "pending"; approverName: string; at: string }
  | { kind: "declined"; deciderName: string; at: string }
  | { kind: "hidden"; slice: string }
  | { kind: "full" };

/** Where a sent share stands for its sender: someone asked for more, or how many recipients opened it. */
export type SentState = { kind: "asked"; requesterName: string; at: string } | { kind: "delivered"; opened: number; recipients: number };

/** One share as the new Shared reads it: the card, the other side (sender, or recipients), when it was sent, its state and whether anything about it is unread. */
export type ShareLine<S> = { code: string; path: string; title: string; people: ScalePerson[]; sentAt: string; state: S; unread: boolean; grants: ScaleGrant[] };

/** Shares of one card between the same people, collapsed: the latest one carries the row. */
export type ShareGroup<S> = { key: string; latest: ShareLine<S>; count: number; lastSentAt: string; activityAt: string; unread: boolean; grants: ScaleGrant[] };

/** A tab's list as drawn: the rows to show now, how many recent rows wait behind ดูเพิ่ม, and the rows older than the fold. */
export type ShareListView<S> = { shown: ShareGroup<S>[]; hiddenRecent: number; older: ShareGroup<S>[] };

function stateAt(state: ReceivedState | SentState): string | null {
  return "at" in state ? state.at : null;
}

function latestOf(left: string, right: string): string {
  return left > right ? left : right;
}

/** When a share last moved: its send, or the later grant, request or decision on it. */
export function activityOf<S extends ReceivedState | SentState>(line: ShareLine<S>): string {
  const at = stateAt(line.state);
  return at ? latestOf(line.sentAt, at) : line.sentAt;
}

function keyOf(line: ShareLine<unknown>): string {
  const people = line.people.map((person) => person.id).sort().join(",");
  return `${line.title}|${people}`;
}

/** One row per card and set of people, sorted by latest activity: repeats count, the most recently active share speaks for the row, and every grant on them stays reachable. */
export function collapseRepeats<S extends ReceivedState | SentState>(lines: readonly ShareLine<S>[]): ShareGroup<S>[] {
  const groups = new Map<string, ShareLine<S>[]>();
  for (const line of lines) groups.set(keyOf(line), [...(groups.get(keyOf(line)) ?? []), line]);
  return [...groups.entries()]
    .map(([key, members]) => {
      const byActivity = [...members].sort((left, right) => activityOf(right).localeCompare(activityOf(left)));
      return {
        key,
        latest: byActivity[0],
        count: members.length,
        lastSentAt: members.map((line) => line.sentAt).reduce(latestOf),
        activityAt: activityOf(byActivity[0]),
        unread: members.some((line) => line.unread),
        grants: members.flatMap((line) => line.grants),
      };
    })
    .sort((left, right) => right.activityAt.localeCompare(left.activityAt));
}

/** The first page of rows active in the last 30 days, the count left behind ดูเพิ่ม, and the rest folded under เก่ากว่านี้. */
export function foldList<S>(groups: readonly ShareGroup<S>[], now: Date, expanded: boolean): ShareListView<S> {
  const cutoff = new Date(now.getTime() - OLDER_AFTER_DAYS * DAY_MS).toISOString();
  const recent = groups.filter((group) => group.activityAt >= cutoff);
  const older = groups.filter((group) => group.activityAt < cutoff);
  const shown = expanded ? recent : recent.slice(0, PAGE_SIZE);
  return { shown, hiddenRecent: recent.length - shown.length, older };
}

/** Search is offered once a tab holds more rows than one page. */
export function offersSearch(groups: readonly ShareGroup<unknown>[]): boolean {
  return groups.length > PAGE_SIZE;
}

/** Rows whose card title or person name holds the query, ignoring case and spacing at the ends. */
export function searchGroups<S>(groups: readonly ShareGroup<S>[], query: string): ShareGroup<S>[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...groups];
  return groups.filter((group) => group.latest.title.toLowerCase().includes(needle) || group.latest.people.some((person) => person.name.toLowerCase().includes(needle)));
}

export function isLive(grant: ScaleGrant, now: Date): boolean {
  return grant.expiresAt > now.toISOString();
}

/** Only rows with a grant still live, each carrying just its live grants. */
export function withLiveGrants<S>(groups: readonly ShareGroup<S>[], now: Date): ShareGroup<S>[] {
  return groups.map((group) => ({ ...group, grants: group.grants.filter((grant) => isLive(grant, now)) })).filter((group) => group.grants.length > 0);
}
