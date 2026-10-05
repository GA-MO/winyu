import { generateObject } from "ai";
import { z } from "zod";
import type { AccessContext, ActionEvent, Dim, Grain, MetricId, MetricQuery, WidgetKind, WidgetSpec } from "@/lib/contracts";
import { actionEvents, alerts, personalWatches } from "@/lib/server/agent/collections";
import { dimsOfFeedKind, feedIntentOf, kindLabel, metricOfFeedKind } from "@/lib/engine/feed-learning";
import { untouchedTemplates } from "@/lib/dashboard/attention";
import { topicOf } from "@/lib/dashboard/one-per-metric";
import { TODAY, addDays } from "@/lib/data/dates";
import { CLOSED_MONTH_METRICS, metricDef } from "@/lib/semantic/metrics";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { utilityModel } from "@/lib/server/models";
import { TH } from "@/lib/i18n/th";

const CLUSTER_DAYS = 14;
const MIN_REPEATS = 3;
const PROMOTE_AT = 3;
const MAX_NEW_PER_DAY = 1;
const DAY_MS = 86_400_000;
const RANGE_DAYS = 27;
const ROW_LIMIT = 8;
const TIME_DIMS: readonly Dim[] = ["date", "week", "month"];
const FEED_MIN_DAYS = 3;
const FEED_OPENS: ReadonlySet<ActionEvent["kind"]> = new Set(["feed_open", "feed_done"]);
const STORY_DIMS: readonly Dim[] = ["agent", "sku", "brand", "plant", "dc", "campaign", "province", "region"];
const ALERT_KEY_PREFIX = "alert:";
const WATCH_KEY_PREFIX = "watch:";

export type Candidate = { intentKey: string; metric: MetricId; dims: Dim[]; count: number; prompt: string };

export type FeedCandidate = Candidate & { kind: string };

type FeedDims = (kind: string, keys: readonly string[]) => Dim[];

const titleSchema = z.object({ title: z.string().min(4).max(48) });

function daysAgo(iso: string, now: number): number {
  return (now - new Date(iso).getTime()) / DAY_MS;
}

/** Question intents the user repeated often enough to be worth a permanent card. */
export function candidatesFrom(events: readonly ActionEvent[], userId: string, now = Date.now()): Candidate[] {
  const clusters = new Map<string, Candidate>();
  for (const event of events) {
    if (event.userId !== userId || event.kind === "dismiss" || !event.intentKey || !event.metric) continue;
    if (daysAgo(event.at, now) > CLUSTER_DAYS) continue;
    const found = clusters.get(event.intentKey) ?? { intentKey: event.intentKey, metric: event.metric, dims: event.dims, count: 0, prompt: event.prompt ?? "" };
    found.count += 1;
    if (event.prompt) found.prompt = event.prompt;
    clusters.set(event.intentKey, found);
  }
  return [...clusters.values()].filter((candidate) => candidate.count >= MIN_REPEATS).sort((left, right) => right.count - left.count);
}

/** The breakdown the matters of one kind were about: the subject of the alerts opened, the slice a watch follows, or the kind's usual breakdown. */
function feedDims(kind: string, keys: readonly string[]): Dim[] {
  for (const key of keys) {
    if (key.startsWith(ALERT_KEY_PREFIX)) {
      const alert = alerts().get(key.slice(ALERT_KEY_PREFIX.length));
      const dim = alert ? STORY_DIMS.find((candidate) => alert.dims[candidate]) : undefined;
      if (dim) return [dim];
    }
    if (key.startsWith(WATCH_KEY_PREFIX)) {
      const watch = personalWatches().get(key.slice(WATCH_KEY_PREFIX.length).split(":")[0] ?? "");
      if (watch) return watch.query.dims;
    }
  }
  return dimsOfFeedKind(kind);
}

/** Kinds of matter the user opened from their feed on three separate days within two weeks, with the slice a card on them would show; `count` is the days, and kinds no metric tells are left out. */
export function feedCandidatesFrom(events: readonly ActionEvent[], userId: string, now = Date.now(), dimsOf: FeedDims = feedDims): FeedCandidate[] {
  const opened = new Map<string, { days: Set<string>; keys: Set<string>; prompt: string }>();
  for (const event of events) {
    if (event.userId !== userId || !FEED_OPENS.has(event.kind) || daysAgo(event.at, now) > CLUSTER_DAYS) continue;
    const intent = feedIntentOf(event.intentKey);
    if (!intent || !metricOfFeedKind(intent.kind)) continue;
    const entry = opened.get(intent.kind) ?? { days: new Set<string>(), keys: new Set<string>(), prompt: "" };
    entry.days.add(event.at.slice(0, 10));
    if (intent.key) entry.keys.add(intent.key);
    if (event.prompt) entry.prompt = event.prompt;
    opened.set(intent.kind, entry);
  }
  return [...opened]
    .filter(([, entry]) => entry.days.size >= FEED_MIN_DAYS)
    .flatMap(([kind, entry]) => {
      const metric = metricOfFeedKind(kind);
      const def = metric ? metricDef(metric) : undefined;
      if (!metric || !def) return [];
      const dims = dimsOf(kind, [...entry.keys]).filter((dim) => def.dims.includes(dim));
      return [{ intentKey: `feed|${kind}`, kind, metric, dims, count: entry.days.size, prompt: entry.prompt }];
    })
    .sort((left, right) => right.count - left.count);
}

export function kindFor(dims: Dim[]): WidgetKind {
  if (dims.length === 0) return "metric";
  if (dims.some((dim) => TIME_DIMS.includes(dim))) return "line";
  return "bar";
}

function grainFor(dims: Dim[]): Grain {
  if (dims.includes("month")) return "month";
  if (dims.includes("week")) return "week";
  return "day";
}

function lastClosedMonth(): { from: string; to: string } {
  const firstOfThisMonth = `${TODAY.slice(0, 7)}-01`;
  const to = addDays(firstOfThisMonth, -1);
  return { from: `${to.slice(0, 7)}-01`, to };
}

export function queryFor(candidate: Candidate, access: AccessContext): MetricQuery {
  const def = metricDef(candidate.metric);
  const dims = candidate.dims.filter((dim) => def?.dims.includes(dim));
  const filters = access.regions === "all" || access.regions.length === 0 ? {} : { region: [...access.regions] };
  const closedMonth = CLOSED_MONTH_METRICS.has(candidate.metric);
  return {
    metric: candidate.metric,
    dims,
    filters,
    range: closedMonth ? lastClosedMonth() : { from: addDays(TODAY, -RANGE_DAYS), to: TODAY },
    grain: closedMonth ? "month" : grainFor(dims),
    compare: closedMonth ? "prev_year" : "prev_period",
    limit: ROW_LIMIT,
  };
}

function templateTitle(candidate: Candidate): string {
  const dim = candidate.dims.find((entry) => !TIME_DIMS.includes(entry));
  return dim ? `${metricLabel(candidate.metric)}ตาม${TH.dim[dim]}` : metricLabel(candidate.metric);
}

async function modelTitle(candidate: Candidate): Promise<string | null> {
  const model = utilityModel();
  if (!model) return null;
  try {
    const result = await generateObject({
      model,
      schema: titleSchema,
      system: TH.compose.titlePrompt,
      prompt: `${candidate.prompt}\n${metricLabel(candidate.metric)}`,
    });
    return result.object.title;
  } catch {
    return null;
  }
}

function suggestedToday(existing: WidgetSpec[], now: number): number {
  const today = new Date(now).toISOString().slice(0, 10);
  return existing.filter((widget) => widget.source === "ai_suggested" && widget.createdAt.slice(0, 10) === today).length;
}

function sameSlice(widget: WidgetSpec, candidate: Pick<Candidate, "metric" | "dims">): boolean {
  return widget.query.metric === candidate.metric && [...widget.query.dims].sort().join(",") === [...candidate.dims].sort().join(",");
}

/** True when one of these widgets is already pinned to the same metric sliced by the same dimensions. */
export function isPinnedSlice(widgets: readonly WidgetSpec[], slice: { metric: MetricId; dims: readonly Dim[] }): boolean {
  return widgets.some((widget) => widget.pinned && sameSlice(widget, { metric: slice.metric, dims: [...slice.dims] }));
}

function suggestionId(userId: string, candidate: Candidate): string {
  return `w_ai_${userId}_${candidate.intentKey.replace(/[|,:]/g, "_")}`;
}

/** Suggested cards the user took off the tray; they are not offered again. */
function dismissedIds(events: readonly ActionEvent[], userId: string): Set<string> {
  return new Set(events.filter((event) => event.userId === userId && event.kind === "dismiss").map((event) => event.intentKey.replace(/^widget:/, "")));
}

async function suggestionOf(access: AccessContext, candidate: Candidate, reason: string, replaces: string | null, position: number, now: number): Promise<WidgetSpec> {
  const title = (await modelTitle(candidate)) ?? templateTitle(candidate);
  return {
    id: suggestionId(access.userId, candidate),
    userId: access.userId,
    title,
    kind: kindFor(candidate.dims),
    query: queryFor(candidate, access),
    pinned: false,
    position,
    source: "ai_suggested",
    reason,
    replaces,
    createdAt: new Date(now).toISOString(),
    version: 1,
  };
}

/**
 * At most one new suggested card a day, never one the user already has or took off the tray: first a kind of matter they keep opening from their feed,
 * then a question they keep asking, offered in place of a starter card they have never looked at when there is one.
 */
export async function composeSuggestion(access: AccessContext, existing: WidgetSpec[], now = Date.now(), events?: readonly ActionEvent[]): Promise<WidgetSpec | null> {
  if (suggestedToday(existing, now) >= MAX_NEW_PER_DAY) return null;
  const all = events ?? actionEvents().all();
  const dismissed = dismissedIds(all, access.userId);
  const isNew = (candidate: Candidate) =>
    access.metricAcl[candidate.metric] === "full" && !existing.some((widget) => sameSlice(widget, candidate)) && !dismissed.has(suggestionId(access.userId, candidate));
  const sameTopic = (candidate: Candidate) => existing.find((widget) => widget.pinned && topicOf(widget) === candidate.metric) ?? null;
  const fromFeed = feedCandidatesFrom(all, access.userId, now).find(isNew);
  if (fromFeed) {
    const covered = sameTopic(fromFeed);
    const reason = TH.compose.fromFeed(kindLabel(fromFeed.kind), fromFeed.count, CLUSTER_DAYS);
    return suggestionOf(access, fromFeed, covered ? TH.compose.insteadOf(covered.title, reason) : reason, covered?.id ?? null, existing.length, now);
  }
  const asked = candidatesFrom(all, access.userId, now).find(isNew);
  if (!asked) return null;
  const covered = sameTopic(asked);
  if (covered) return suggestionOf(access, asked, TH.compose.insteadOf(covered.title, TH.compose.reason(asked.count, CLUSTER_DAYS)), covered.id, existing.length, now);
  const replaced = untouchedTemplates(existing, all, access.userId, now).find((widget) => !existing.some((other) => other.replaces === widget.id));
  const reason = replaced ? TH.compose.replaces(replaced.title, asked.count, CLUSTER_DAYS) : TH.compose.reason(asked.count, CLUSTER_DAYS);
  return suggestionOf(access, asked, reason, replaced?.id ?? null, existing.length, now);
}

/** The one intent this user has repeated exactly enough times for the chat to offer a pin. */
export function repeatedIntent(userId: string, now = Date.now(), events?: readonly ActionEvent[]): { metric: MetricId; dims: Dim[]; count: number } | null {
  const hit = candidatesFrom(events ?? actionEvents().all(), userId, now).find((candidate) => candidate.count === PROMOTE_AT);
  return hit ? { metric: hit.metric, dims: hit.dims, count: hit.count } : null;
}

/** True once the user has asked the same thing often enough that the chat should offer to pin it. */
export function shouldOfferPin(userId: string, intentKey: string, now = Date.now(), events?: readonly ActionEvent[]): boolean {
  if (!intentKey) return false;
  const repeats = (events ?? actionEvents().all()).filter(
    (event) => event.userId === userId && event.intentKey === intentKey && daysAgo(event.at, now) <= CLUSTER_DAYS,
  ).length;
  return repeats === PROMOTE_AT;
}

export { CLUSTER_DAYS, MIN_REPEATS, PROMOTE_AT };
