import type { AccessContext, Alert, ContextPacket, Dim, FeedAction, FeedTone, FeedItem, FeedStateRecord, NextAction, PersonalWatch } from "@/lib/contracts";
import { alertRowOf } from "@/lib/cards/alert-row";
import type { AmbientCard, VisitStop } from "@/lib/dashboard/ambient";
import { weekKeyOfIso } from "@/lib/data/dates";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import type { Dictionary } from "@/lib/semantic/dictionary";
import { actionEvents, alerts, feedStates, memoryFacts, visits } from "@/lib/server/agent/collections";
import { feedIntentKey, isMutableKind, learnFeed, mutesOfKind, notFollowingStatement } from "@/lib/engine/feed-learning";
import { proposeMemory } from "@/lib/engine/memory";
import { isTrusted } from "@/lib/engine/memory-status";
import { conditionLabel } from "@/lib/engine/personal-watches";
import { watchesOf } from "@/lib/server/watches";
import { toneOf } from "@/lib/dashboard/metric-display";
import { alertIntentKey, alertSubject, childrenOf, muteAlertForUser, openPacketsFor, relatedTo, relevanceContext, relevanceOf, relevantAlertsFor, unopenedDays, type RelevanceContext } from "@/lib/server/alerts";
import { ambientFor, visitsFor } from "@/lib/server/dashboard";
import { loadDictionary } from "@/lib/server/master-data";
import { actionsForAlert } from "@/lib/server/next-actions";
import { peopleFeedFor } from "@/lib/server/people-feed";
import { campaignFeedFor } from "@/lib/server/campaign-feed";
import { systemFeedFor } from "@/lib/server/system-feed";
import { recordAction } from "@/lib/server/threads";

const DAY_MS = 86_400_000;
const CLEAR_MOVE_PCT = 100;
const SNOOZE_DAYS = 7;
const LANDING_ROWS = 5;
const LANDING_ALERT_ROWS = 2;
const ALERT_RANK: Record<Alert["severity"], number> = { P1: 900, P2: 600, P3: 200 };
const PACKET_RANK: Record<ContextPacket["urgency"], number> = { high: 850, medium: 550, low: 250 };
const VISIT_RANK = { danger: 800, warning: 500, other: 300 } as const;
const WATCH_RANK = 880;
const MUTES_BEFORE_PROPOSING = 3;
const PARENTHETICAL = /\s*\(.*\)$/;

const STORY_DIMS = ["agent", "sku", "brand", "plant", "dc", "campaign", "province", "region"] as const;

function storySubject(alert: Alert): string {
  const dim = STORY_DIMS.find((candidate) => alert.dims[candidate]);
  return dim ? `${dim}:${alert.dims[dim]}` : "all";
}

/** A movement put down to a campaign is that campaign's story; otherwise the metric and its main subject. */
function storyOf(alert: Alert): string {
  return alert.campaignId ? `campaign:${alert.campaignId}` : `${alert.metric}|${storySubject(alert)}`;
}

/** A watch that fired on a slice an open alert already tells is the same story, so the two make one row. */
function watchStory(watch: PersonalWatch, open: readonly Alert[]): string | null {
  const filters = Object.entries(watch.query.filters) as [Dim, string[] | undefined][];
  const alert = open.find((candidate) => candidate.metric === watch.query.metric && filters.every(([dim, values]) => !values || values.length === 0 || values.includes(candidate.dims[dim] ?? "")));
  return alert ? storyOf(alert) : null;
}

/** What an alert escalated to a manager adds under its label: whose it is and how long it has waited. */
function escalationNote(access: AccessContext, alert: Alert, context: RelevanceContext): string | null {
  if (relevanceOf(alert, access, context) !== "escalated") return null;
  const days = unopenedDays(alert, context);
  const owner = findUser(alert.ownerUserId)?.nameTh ?? alert.ownerUserId;
  return days === null ? null : TH.feed.unopened(owner, days);
}

function signedGap(alert: Alert, dictionary: Dictionary): string | null {
  const row = alertRowOf(alert, dictionary);
  return row.gapLabel ? `${alert.direction === "down" ? "−" : "+"}${row.gapLabel}` : null;
}

/** Good news: a low-severity move in the direction the metric wants; it is its owner's to know, never a task. */
function isGoodNews(alert: Alert): boolean {
  return alert.severity === "P3" && toneOf(alert.metric, alert.direction === "up" ? CLEAR_MOVE_PCT : -CLEAR_MOVE_PCT) === "good";
}

function toneOfAlert(alert: Alert): FeedTone {
  if (alert.severity === "P1") return "danger";
  if (alert.severity === "P2") return "warning";
  return isGoodNews(alert) ? "success" : "info";
}

/** What an alert's row adds under its label beyond the metric: how many more slices tell the same story, the other side of its chain of events, and who has left it waiting. */
function detailOf(access: AccessContext, alert: Alert, dictionary: Dictionary, context: RelevanceContext, metric: string): string {
  const children = childrenOf(alert).filter((child) => child.status === "open").length;
  const [related] = relatedTo(alert);
  const parts = [
    metric,
    children > 0 ? TH.feed.moreSlices(children) : null,
    related ? TH.feed.relatedTo(`${alertRowOf(related, dictionary).scopeLabel} ${signedGap(related, dictionary) ?? ""}`.trim()) : null,
    escalationNote(access, alert, context),
  ];
  return parts.filter((part): part is string => Boolean(part)).join(" · ");
}

function alertItem(access: AccessContext, alert: Alert, dictionary: Dictionary, context: RelevanceContext): FeedItem {
  const row = alertRowOf(alert, dictionary);
  const metric = row.metricLabel.replace(PARENTHETICAL, "");
  const gap = signedGap(alert, dictionary);
  return {
    key: `alert:${alert.id}`,
    source: "alert",
    kind: `alert:${alert.metric}`,
    story: storyOf(alert),
    rank: ALERT_RANK[alert.severity],
    tone: toneOfAlert(alert),
    label: row.scopeLabel,
    reason: alert.metric === "days_of_cover" ? TH.feed.coverLeft(alert.observed.toFixed(1)) : (gap ?? row.severityLabel),
    detail: detailOf(access, alert, dictionary, context, metric),
    prompt: TH.landing.askAbout(row.scopeLabel),
    alertId: alert.id,
    packetId: null,
    canFinish: true,
    actions: actionsForAlert(access, alert, dictionary).filter((action) => action.kind === "handoff" && action.tool !== null).slice(0, 1),
    because: null,
  };
}

function packetItem(packet: ContextPacket): FeedItem {
  const from = findUser(packet.fromUserId)?.nameTh ?? packet.fromUserId;
  return {
    key: `packet:${packet.id}`,
    source: "packet",
    kind: "packet",
    story: null,
    rank: PACKET_RANK[packet.urgency],
    tone: packet.urgency === "high" ? "danger" : packet.urgency === "medium" ? "warning" : "info",
    label: packet.title,
    reason: TH.inbox.urgency[packet.urgency],
    detail: TH.landing.fromName(from),
    prompt: TH.landing.packetPrompt(packet.title),
    alertId: null,
    packetId: packet.id,
    canFinish: false,
    actions: [],
    because: null,
  };
}

function visitItems(stops: readonly VisitStop[], week: string): FeedItem[] {
  return stops.map((stop, index) => ({
    key: `visit:${stop.agent}:${week}`,
    source: "visit",
    kind: "visit",
    story: null,
    rank: (stop.tone === "danger" ? VISIT_RANK.danger : stop.tone === "warning" ? VISIT_RANK.warning : VISIT_RANK.other) + stops.length - index,
    tone: stop.tone === "danger" ? "danger" : "warning",
    label: stop.agent,
    reason: stop.reason,
    detail: null,
    prompt: stop.prompt,
    alertId: null,
    packetId: null,
    canFinish: true,
    actions: [],
    because: null,
  }));
}

function watchItem(watch: PersonalWatch, story: string | null): FeedItem {
  return {
    key: `watch:${watch.id}:${watch.lastTriggeredAt ?? ""}`,
    source: "watch",
    kind: `watch:${watch.query.metric}`,
    story,
    rank: WATCH_RANK,
    tone: "danger",
    label: watch.title,
    reason: TH.feed.watchHit,
    detail: conditionLabel(watch.query, watch.condition),
    prompt: TH.landing.askAbout(watch.title),
    alertId: null,
    packetId: null,
    canFinish: true,
    actions: [],
    because: null,
  };
}

/** Kinds the user asked Cop to stop following, from the memory statements they confirmed or that came up again. */
function mutedKindsOf(userId: string, kinds: Iterable<string>): Set<string> {
  const statements = new Set(memoryFacts().where((fact) => fact.userId === userId && fact.type === "preference" && isTrusted(fact)).map((fact) => fact.value));
  return new Set([...kinds].filter((kind) => isMutableKind(kind) && statements.has(notFollowingStatement(kind))));
}

function hiddenKeys(userId: string, now: number): Set<string> {
  const at = new Date(now).toISOString();
  return new Set(
    feedStates()
      .where((record) => record.userId === userId && (record.until === null || record.until > at))
      .map((record) => record.key),
  );
}

/** Everything this user should look at or act on, from every source in their scope, most urgent first; what they finished, put off or disowned is left out, and so is any button whose tool is closed to them. */
export async function feedFor(access: AccessContext, now = Date.now()): Promise<FeedItem[]> {
  const dictionary = await loadDictionary();
  const stops = await visitsFor(access);
  const visited = new Set(stops.map((stop) => stop.agent));
  const context = relevanceContext(access, now);
  const relevant = relevantAlertsFor(access, context);
  const alertItems = relevant
    .filter((alert) => !alert.dims.agent || !visited.has(dictionary.displayLabel("agent", alert.dims.agent)))
    .map((alert) => alertItem(access, alert, dictionary, context));
  const items = [
    ...alertItems,
    ...openPacketsFor(access).map(packetItem),
    ...visitItems(stops, weekKeyOfIso(new Date(now).toISOString().slice(0, 10))),
    ...(await peopleFeedFor(access)),
    ...(await campaignFeedFor(access)),
    ...systemFeedFor(access, now),
    ...watchesOf(access.userId).filter((watch) => watch.state === "triggered").map((watch) => watchItem(watch, watchStory(watch, relevant))),
  ];
  const hidden = hiddenKeys(access.userId, now);
  const allowed = (action: NextAction) => action.tool === null || access.toolAllow.includes(action.tool);
  const open = items.filter((item) => !hidden.has(item.key)).map((item) => ({ ...item, actions: item.actions.filter(allowed) }));
  return learnFeed(open, {
    events: actionEvents().where((event) => event.userId === access.userId),
    seenCounts: visits().get(access.userId)?.seenCounts ?? {},
    mutedKinds: mutedKindsOf(access.userId, open.map((item) => item.kind)),
    now,
  });
}

/** A matter to act on: everything on the feed except low-severity alerts, which are movements or good news to know about, not tasks. */
export function isTask(item: FeedItem): boolean {
  if (item.tone === "success") return false;
  return item.source !== "alert" || item.tone !== "info";
}

/** Good news the user owns, one row per story: what went right in their patch, kept apart from what needs doing. */
export async function goodNewsFor(access: AccessContext, now = Date.now()): Promise<FeedItem[]> {
  return onePerStory((await feedFor(access, now)).filter(isGoodNewsItem));
}

/** A good-news row: an alert or a campaign that went the way its owner wanted. */
export function isGoodNewsItem(item: FeedItem): boolean {
  return item.tone === "success" && (item.source === "alert" || item.source === "campaign");
}

/** The inbox's "to do" tab: the tasks on the feed, one row per story. */
export async function todoFor(access: AccessContext, now = Date.now()): Promise<FeedItem[]> {
  return onePerStory((await feedFor(access, now)).filter(isTask));
}

/** The first item of each story, in feed order; items with no story stand alone. */
export function onePerStory(items: readonly FeedItem[], told: Iterable<string> = []): FeedItem[] {
  const seen = new Set(told);
  return items.filter((item) => {
    if (!item.story) return true;
    if (seen.has(item.story)) return false;
    seen.add(item.story);
    return true;
  });
}

/** The rows under the cards: one row per story, no low-severity alerts, and at most two more alerts so the matters that are not in the inbox still get room. */
function landingRows(items: readonly FeedItem[], carded: readonly string[]): FeedItem[] {
  const told = items.filter((item) => carded.includes(item.key)).flatMap((item) => item.story ?? []);
  const candidates = onePerStory(items.filter((item) => !carded.includes(item.key) && isTask(item)), told);
  const rows: FeedItem[] = [];
  let alertRows = 0;
  for (const item of candidates) {
    if (rows.length >= LANDING_ROWS) break;
    if (item.source === "alert" && alertRows >= LANDING_ALERT_ROWS) continue;
    if (item.source === "alert") alertRows += 1;
    rows.push(item);
  }
  return rows;
}

/** `taskCount` is every task on the feed, one per story, not only the ones the landing has room to show. */
export type LandingFeed = { cards: AmbientCard[]; rows: FeedItem[]; shownKeys: string[]; taskCount: number };

function cardKey(card: AmbientCard): string | null {
  if (card.alertId) return `alert:${card.alertId}`;
  return card.packetId ? `packet:${card.packetId}` : null;
}

/** The landing's share of the feed: up to two full cards for alerts and handoffs, then the next most urgent matters as rows. */
export async function landingFeedFor(access: AccessContext, now = Date.now()): Promise<LandingFeed> {
  const items = await feedFor(access, now);
  const alertIds = new Set(items.flatMap((item) => (item.alertId ? [item.alertId] : [])));
  const packetIds = new Set(items.flatMap((item) => (item.packetId ? [item.packetId] : [])));
  const cards = await ambientFor(access, [], { alertIds, packetIds });
  const carded = cards.flatMap((card) => cardKey(card) ?? []);
  const rows = landingRows(items, carded);
  return { cards, rows, shownKeys: [...carded, ...rows.map((row) => row.key)], taskCount: onePerStory(items.filter(isTask)).length };
}

function stateFor(action: Exclude<FeedAction, "open">, now: number): Pick<FeedStateRecord, "state" | "until"> {
  if (action === "snooze") return { state: "snoozed", until: new Date(now + SNOOZE_DAYS * DAY_MS).toISOString() };
  return { state: action === "done" ? "done" : "muted", until: null };
}

/** After the third "not mine" on the same kind within a month, Cop puts forward that the user does not follow it; it takes effect once confirmed or said again. */
function proposeStopFollowing(userId: string, kind: string, now: number): void {
  if (!isMutableKind(kind)) return;
  const mutes = mutesOfKind(actionEvents().where((event) => event.userId === userId), kind, now);
  if (mutes >= MUTES_BEFORE_PROPOSING) proposeMemory(userId, { type: "preference", value: notFollowingStatement(kind) });
}

export type FeedActionResult = { ok: true } | { ok: false; status: 400 | 404 };

/** Records what the user did with one item of their own feed; an item outside it is treated as missing, and a handoff is finished only in the inbox. */
export async function actOnFeedItem(access: AccessContext, key: string, action: FeedAction, now = Date.now()): Promise<FeedActionResult> {
  const item = (await feedFor(access, now)).find((candidate) => candidate.key === key);
  if (!item) return { ok: false, status: 404 };
  if (action !== "open" && !item.canFinish) return { ok: false, status: 400 };
  recordAction(access.userId, `feed_${action}`, feedIntentKey(item.kind, item.key), item.prompt, null);
  const alert = item.alertId ? alerts().get(item.alertId) ?? null : null;
  if (alert && action === "open") recordAction(access.userId, "alert_open", alertIntentKey(alert), null, null, alertSubject(alert));
  if (action === "open") return { ok: true };
  feedStates().put({ id: `${access.userId}|${key}`, userId: access.userId, key, ...stateFor(action, now), at: new Date(now).toISOString() });
  if (alert && action === "mute") await muteAlertForUser(alert, access, now);
  if (action === "mute") proposeStopFollowing(access.userId, item.kind, now);
  return { ok: true };
}
