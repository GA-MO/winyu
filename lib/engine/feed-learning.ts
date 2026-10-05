import type { ActionEvent, Dim, FeedItem, MetricId } from "@/lib/contracts";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";
import { METRICS } from "@/lib/semantic/metrics";

const WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;
const MIN_ACTED = 3;
const MIN_KIND_OPENS = 2;
const BOOST_MAX = 60;
const PENALTY_PER_PUT_OFF = 20;
const PENALTY_MAX = 60;
const IGNORED_AFTER_VISITS = 3;
const IGNORED_PENALTY = 150;
const FEED_PREFIX = "feed";
const SEPARATOR = "|";
const ALERT_KIND_PREFIX = "alert:";
const WATCH_KIND_PREFIX = "watch:";
const PARENTHETICAL = /\s*\(.*\)$/;
const KIND_SLICES: Readonly<Record<string, { metric: MetricId; dims: Dim[] }>> = {
  "person:risk": { metric: "attrition_rate", dims: ["department"] },
  visit: { metric: "sell_out_volume", dims: ["agent"] },
};
const MUTABLE_KINDS: ReadonlySet<string> = new Set(["person:cert", "person:risk", "person:overtime", "opening", "visit"]);

export type FeedSignals = {
  events: readonly ActionEvent[];
  seenCounts: Readonly<Record<string, number>>;
  mutedKinds: ReadonlySet<string>;
  now: number;
};

/** The intent a feed event is counted under: the kind (what it teaches) and the item (whether this one was ever opened). */
export function feedIntentKey(kind: string, key: string): string {
  return [FEED_PREFIX, kind, key].join(SEPARATOR);
}

function parseIntent(intentKey: string): { kind: string; key: string | null } | null {
  const [prefix, kind, ...rest] = intentKey.split(SEPARATOR);
  if (prefix !== FEED_PREFIX || !kind) return null;
  return { kind, key: rest.length > 0 ? rest.join(SEPARATOR) : null };
}

function metricOfKind(kind: string, prefix: string): MetricId | null {
  const metric = kind.slice(prefix.length) as MetricId;
  return METRICS[metric] ? metric : null;
}

/** What a kind of matter is called in a sentence: "ใบอนุญาตใกล้หมด", or the metric's name for alerts and watches. */
export function kindLabel(kind: string): string {
  const named = TH.feed.kinds[kind];
  if (named) return named;
  const metric = kind.startsWith(ALERT_KIND_PREFIX) ? metricOfKind(kind, ALERT_KIND_PREFIX) : kind.startsWith(WATCH_KIND_PREFIX) ? metricOfKind(kind, WATCH_KIND_PREFIX) : null;
  return metric ? metricLabel(metric).replace(PARENTHETICAL, "") : kind;
}

/** The metric a kind of matter is measured by on a dashboard card; null for matters no metric tells, such as licences, overtime, openings and handoffs. */
export function metricOfFeedKind(kind: string): MetricId | null {
  if (kind.startsWith(ALERT_KIND_PREFIX)) return metricOfKind(kind, ALERT_KIND_PREFIX);
  if (kind.startsWith(WATCH_KIND_PREFIX)) return metricOfKind(kind, WATCH_KIND_PREFIX);
  return KIND_SLICES[kind]?.metric ?? null;
}

/** The breakdown a card on a kind of matter shows when the matters themselves do not say one. */
export function dimsOfFeedKind(kind: string): Dim[] {
  return KIND_SLICES[kind]?.dims ?? [];
}

/** The kind and item a feed event was counted under, or null for any other event. */
export function feedIntentOf(intentKey: string): { kind: string; key: string | null } | null {
  return parseIntent(intentKey);
}

/** Kinds a user may stop following as a whole; alerts are muted per slice and handoffs are always answered. */
export function isMutableKind(kind: string): boolean {
  return MUTABLE_KINDS.has(kind);
}

/** The memory statement that stops a kind showing up, so the same words are written and read. */
export function notFollowingStatement(kind: string): string {
  return TH.memory.notFollowing(kindLabel(kind));
}

type Tally = { opened: Map<string, number>; putOff: Map<string, number>; openedKeys: Set<string>; acted: number };

function tallyOf(events: readonly ActionEvent[], now: number): Tally {
  const tally: Tally = { opened: new Map(), putOff: new Map(), openedKeys: new Set(), acted: 0 };
  for (const event of events) {
    if ((now - new Date(event.at).getTime()) / DAY_MS > WINDOW_DAYS) continue;
    const intent = parseIntent(event.intentKey);
    if (!intent) continue;
    if (event.kind === "feed_open" || event.kind === "feed_done") {
      tally.opened.set(intent.kind, (tally.opened.get(intent.kind) ?? 0) + 1);
      if (intent.key) tally.openedKeys.add(intent.key);
      tally.acted += 1;
    }
    if (event.kind === "feed_snooze" || event.kind === "feed_mute") tally.putOff.set(intent.kind, (tally.putOff.get(intent.kind) ?? 0) + 1);
  }
  return tally;
}

/** How many times the user said "not mine" to this kind within the window. */
export function mutesOfKind(events: readonly ActionEvent[], kind: string, now: number): number {
  return events.filter((event) => event.kind === "feed_mute" && parseIntent(event.intentKey)?.kind === kind && (now - new Date(event.at).getTime()) / DAY_MS <= WINDOW_DAYS).length;
}

function adjusted(item: FeedItem, tally: Tally, seenCounts: Readonly<Record<string, number>>): FeedItem {
  const opened = tally.opened.get(item.kind) ?? 0;
  const boost = tally.acted >= MIN_ACTED && opened >= MIN_KIND_OPENS ? Math.round((BOOST_MAX * opened) / tally.acted) : 0;
  const penalty = Math.min(PENALTY_MAX, (tally.putOff.get(item.kind) ?? 0) * PENALTY_PER_PUT_OFF);
  const ignored = (seenCounts[item.key] ?? 0) >= IGNORED_AFTER_VISITS && !tally.openedKeys.has(item.key) ? IGNORED_PENALTY : 0;
  return {
    ...item,
    rank: item.rank + boost - penalty - ignored,
    because: boost > 0 ? TH.feed.because(kindLabel(item.kind), opened, WINDOW_DAYS) : item.because,
  };
}

/**
 * The feed as this user has shown they read it: kinds they open rise, kinds they put off sink, an item seen on three visits
 * and never opened drops below the rest, and a kind they asked Winyu to stop following is gone. A rise says why, once per kind; nothing else does.
 */
export function learnFeed(items: readonly FeedItem[], signals: FeedSignals): FeedItem[] {
  const tally = tallyOf(signals.events, signals.now);
  const learned = items
    .filter((item) => !signals.mutedKinds.has(item.kind))
    .map((item) => adjusted(item, tally, signals.seenCounts))
    .sort((left, right) => right.rank - left.rank);
  return explainedOncePerKind(learned);
}

/** The reason a kind rose is said on its first item only; saying it on every row of that kind is noise. */
function explainedOncePerKind(items: FeedItem[]): FeedItem[] {
  const explained = new Set<string>();
  return items.map((item) => {
    if (!item.because) return item;
    if (explained.has(item.kind)) return { ...item, because: null };
    explained.add(item.kind);
    return item;
  });
}
