import type { AccessContext, Alert, ContextPacket, FeedAction, FeedItem, FeedStateRecord } from "@/lib/contracts";
import { alertRowOf } from "@/lib/cards/alert-row";
import type { AmbientCard, VisitStop } from "@/lib/dashboard/ambient";
import { weekKeyOfIso } from "@/lib/data/dates";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import type { Dictionary } from "@/lib/semantic/dictionary";
import { alerts, feedStates } from "@/lib/server/agent/collections";
import { alertIntentKey, alertSubject, muteAlertForUser, openAlertsFor, openPacketsFor, relevanceOf } from "@/lib/server/alerts";
import { ambientFor, visitsFor } from "@/lib/server/dashboard";
import { loadDictionary } from "@/lib/server/master-data";
import { peopleFeedFor } from "@/lib/server/people";
import { recordAction } from "@/lib/server/threads";

const DAY_MS = 86_400_000;
const SNOOZE_DAYS = 7;
const LANDING_ROWS = 5;
const LANDING_ALERT_ROWS = 2;
const ALERT_RANK: Record<Alert["severity"], number> = { P1: 900, P2: 600, P3: 200 };
const PACKET_RANK: Record<ContextPacket["urgency"], number> = { high: 850, medium: 550, low: 250 };
const VISIT_RANK = { danger: 800, warning: 500, other: 300 } as const;
const PARENTHETICAL = /\s*\(.*\)$/;

const STORY_DIMS = ["agent", "sku", "brand", "plant", "dc", "campaign", "province", "region"] as const;

function storySubject(alert: Alert): string {
  const dim = STORY_DIMS.find((candidate) => alert.dims[candidate]);
  return dim ? `${dim}:${alert.dims[dim]}` : "all";
}

function alertItem(alert: Alert, dictionary: Dictionary): FeedItem {
  const row = alertRowOf(alert, dictionary);
  const gap = row.gapLabel ? `${alert.direction === "down" ? "−" : "+"}${row.gapLabel}` : null;
  return {
    key: `alert:${alert.id}`,
    source: "alert",
    kind: `alert:${alert.metric}`,
    story: `${alert.metric}|${storySubject(alert)}`,
    rank: ALERT_RANK[alert.severity],
    tone: alert.severity === "P1" ? "danger" : alert.severity === "P2" ? "warning" : "info",
    label: row.scopeLabel,
    reason: gap ?? row.severityLabel,
    detail: row.metricLabel.replace(PARENTHETICAL, ""),
    prompt: TH.landing.askAbout(row.scopeLabel),
    alertId: alert.id,
    packetId: null,
    canFinish: true,
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
  }));
}

function hiddenKeys(userId: string, now: number): Set<string> {
  const at = new Date(now).toISOString();
  return new Set(
    feedStates()
      .where((record) => record.userId === userId && (record.until === null || record.until > at))
      .map((record) => record.key),
  );
}

/** Everything this user should look at or act on, from every source in their scope, most urgent first; what they finished, put off or disowned is left out. */
export async function feedFor(access: AccessContext, now = Date.now()): Promise<FeedItem[]> {
  const dictionary = await loadDictionary();
  const stops = await visitsFor(access);
  const visited = new Set(stops.map((stop) => stop.agent));
  const alertItems = openAlertsFor(access)
    .filter((alert) => relevanceOf(alert, access) !== "other")
    .filter((alert) => !alert.dims.agent || !visited.has(dictionary.displayLabel("agent", alert.dims.agent)))
    .map((alert) => alertItem(alert, dictionary));
  const items = [
    ...alertItems,
    ...openPacketsFor(access).map(packetItem),
    ...visitItems(stops, weekKeyOfIso(new Date(now).toISOString().slice(0, 10))),
    ...(await peopleFeedFor(access)),
  ];
  const hidden = hiddenKeys(access.userId, now);
  return items.filter((item) => !hidden.has(item.key)).sort((left, right) => right.rank - left.rank);
}

/** The rows under the cards: one row per story, no low-severity alerts, and at most two more alerts so the matters that are not in the inbox still get room. */
function landingRows(items: readonly FeedItem[], carded: readonly string[]): FeedItem[] {
  const told = new Set(items.filter((item) => carded.includes(item.key)).flatMap((item) => item.story ?? []));
  const rows: FeedItem[] = [];
  let alertRows = 0;
  for (const item of items) {
    if (rows.length >= LANDING_ROWS) break;
    if (carded.includes(item.key) || (item.story && told.has(item.story))) continue;
    if (item.source === "alert" && (item.tone === "info" || alertRows >= LANDING_ALERT_ROWS)) continue;
    if (item.story) told.add(item.story);
    if (item.source === "alert") alertRows += 1;
    rows.push(item);
  }
  return rows;
}

export type LandingFeed = { cards: AmbientCard[]; rows: FeedItem[]; shownKeys: string[] };

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
  return { cards, rows, shownKeys: [...carded, ...rows.map((row) => row.key)] };
}

function stateFor(action: Exclude<FeedAction, "open">, now: number): Pick<FeedStateRecord, "state" | "until"> {
  if (action === "snooze") return { state: "snoozed", until: new Date(now + SNOOZE_DAYS * DAY_MS).toISOString() };
  return { state: action === "done" ? "done" : "muted", until: null };
}

export type FeedActionResult = { ok: true } | { ok: false; status: 400 | 404 };

/** Records what the user did with one item of their own feed; an item outside it is treated as missing, and a handoff is finished only in the inbox. */
export async function actOnFeedItem(access: AccessContext, key: string, action: FeedAction, now = Date.now()): Promise<FeedActionResult> {
  const item = (await feedFor(access, now)).find((candidate) => candidate.key === key);
  if (!item) return { ok: false, status: 404 };
  if (action !== "open" && !item.canFinish) return { ok: false, status: 400 };
  recordAction(access.userId, `feed_${action}`, `feed|${item.kind}`, item.prompt, null);
  const alert = item.alertId ? alerts().get(item.alertId) ?? null : null;
  if (alert && action === "open") recordAction(access.userId, "alert_open", alertIntentKey(alert), null, null, alertSubject(alert));
  if (action === "open") return { ok: true };
  feedStates().put({ id: `${access.userId}|${key}`, userId: access.userId, key, ...stateFor(action, now), at: new Date(now).toISOString() });
  if (alert && action === "mute") await muteAlertForUser(alert, access, now);
  return { ok: true };
}
