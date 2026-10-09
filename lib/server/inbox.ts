import type { AccessContext, Alert, ContextPacket, Dim, FeedItem, GrantRequest } from "@/lib/contracts";
import type { AlertItem, EvidenceLine, GrantRequestItem, HandoffItem, HandoffStatus, InboxCounts, InboxPayload, Movement, ReplyItem, TodoItem } from "@/components/inbox/types";
import { alertsInboxEnabled, handoffEnabled } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import { formatDelta, formatMetricValue, metricLabel, toneOf } from "@/lib/dashboard/metric-display";
import { formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import type { Dictionary } from "@/lib/semantic/dictionary";
import { sliceLabel } from "@/lib/share/grant-label";
import { canJudge, openAlertsFor, visibleAlert } from "@/lib/server/alerts";
import { goodNewsFor, storyOf, todoFor } from "@/lib/server/feed";
import { grantRequests } from "@/lib/server/grants";
import { packetsFor, resolveEvidence, sentPackets, type EvidenceView } from "@/lib/server/handoff";
import { loadDictionary } from "@/lib/server/master-data";
import { notificationsIn } from "@/lib/server/notify";
import { lessonFor } from "@/lib/server/outcomes";
import { shares } from "@/lib/server/share/shares";

const MAX_ITEMS = 20;
const MAX_ALERT_ITEMS = 60;
const PERCENT = 100;
const SCOPE_ORDER: Dim[] = ["agent", "dc", "plant", "sku", "brand", "channel", "province", "region"];
/** A handoff stays in its recipient's Inbox until they return or close it. */
const UNDECIDED: ReadonlySet<HandoffStatus> = new Set(["open", "need_info", "accepted"]);
/** A handoff the recipient has not yet picked up: the only state the bell counts. */
const NEW_HANDOFF: HandoffStatus = "open";

function nameOf(userId: string): string {
  return findUser(userId)?.nameTh ?? userId;
}

function roleOf(userId: string): string {
  const user = findUser(userId);
  return user ? TH.role[user.role] : "";
}

function evidenceOf(view: EvidenceView): EvidenceLine {
  return {
    label: view.metric,
    value: view.scope ? `${view.range} · ${view.scope}` : view.range,
    summary: view.denied ? TH.handoff.denied : view.summary,
    masked: view.masked,
    denied: view.denied,
    requestPrompt: view.masked || view.denied ? TH.handoff.requestPrompt(view.metric, view.ownerUserId ?? "") : null,
  };
}

function scopeOf(alert: Alert, dictionary: Dictionary): string {
  const shown = SCOPE_ORDER.filter((dim) => alert.dims[dim] && !(dim === "brand" && alert.dims.sku) && !(dim === "region" && Object.keys(alert.dims).length > 1));
  return shown.map((dim) => dictionary.displayLabel(dim, alert.dims[dim] as string)).join(" · ");
}

/** An alert's movement as people read it, with observed over expected for the bars; no ratio when either side is not a positive amount. */
export function movementOf(alert: Pick<Alert, "metric" | "observed" | "expected">): Movement {
  const delta = alert.expected === 0 ? null : ((alert.observed - alert.expected) / Math.abs(alert.expected)) * PERCENT;
  return {
    observed: formatMetricValue(alert.metric, alert.observed),
    expected: formatMetricValue(alert.metric, alert.expected),
    delta: formatDelta(delta),
    tone: toneOf(alert.metric, delta),
    ratio: alert.expected > 0 && alert.observed >= 0 ? alert.observed / alert.expected : null,
  };
}

function windowOf(alert: Alert): string {
  return `${formatDateTh(alert.window.from)} – ${formatDateTh(alert.window.to)}`;
}

function alertOf(alert: Alert, access: AccessContext, handoffOpen: boolean, dictionary: Dictionary): AlertItem {
  const owner = findUser(alert.ownerUserId);
  const scope = scopeOf(alert, dictionary);
  return {
    id: alert.id,
    canJudge: canJudge(alert, access),
    lesson: lessonFor(alert),
    severity: alert.severity,
    metric: metricLabel(alert.metric),
    hypothesis: alert.hypothesis,
    verifySteps: alert.verifySteps,
    at: alert.at,
    scope,
    window: windowOf(alert),
    movement: movementOf(alert),
    ownerName: owner?.nameTh ?? "",
    handoffPrompt: handoffOpen ? TH.inbox.handoffPrompt(metricLabel(alert.metric), scope, owner?.nameTh ?? "") : null,
  };
}

/** The first alert a handoff carries that its recipient may see: the number the handoff is about, read from the alert, never from the title. */
function linkedAlertOf(packet: ContextPacket, access: AccessContext): Alert | null {
  for (const id of packet.alertIds) {
    const alert = visibleAlert(id, access);
    if (alert) return alert;
  }
  return null;
}

async function handoffOf(packet: ContextPacket, access: AccessContext): Promise<HandoffItem> {
  const alert = linkedAlertOf(packet, access);
  return {
    id: packet.id,
    title: packet.title,
    ask: packet.ask,
    urgency: packet.urgency,
    sla: packet.sla,
    status: packet.status,
    fromName: nameOf(packet.fromUserId),
    fromRole: roleOf(packet.fromUserId),
    evidence: (await resolveEvidence(packet, access)).map(evidenceOf),
    suggestedActions: [...packet.suggestedActions],
    digest: packet.conversationDigest,
    at: packet.createdAt,
    outcome: packet.outcome,
    alertCount: packet.alertIds.length,
    replies: packet.thread.map((reply) => ({ name: nameOf(reply.userId), at: reply.at, text: reply.text })),
    movement: alert ? movementOf(alert) : null,
    window: alert ? windowOf(alert) : null,
  };
}

function grantRequestOf(request: GrantRequest): GrantRequestItem {
  const requester = findUser(request.requesterId);
  return {
    id: request.id,
    requesterName: requester?.nameTh ?? request.requesterId,
    requesterTitle: requester?.title ?? "",
    slice: sliceLabel(request.slice),
    reason: request.reason,
    cardTitle: shares().get(request.shareCode)?.title ?? null,
    at: request.createdAt,
  };
}

/** The requests for a temporary grant waiting on this approver, oldest first. */
export function pendingRequestsFor(approverId: string): GrantRequest[] {
  return grantRequests()
    .where((request) => request.approverId === approverId && request.status === "pending")
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

/** The handoffs sent to this person that still wait on them. */
export function undecidedHandoffsFor(userId: string): ContextPacket[] {
  return packetsFor(userId).filter((packet) => UNDECIDED.has(packet.status));
}

/** The handoffs sent to this person that they have not yet picked up, newest first. */
export function newHandoffsFor(userId: string): ContextPacket[] {
  return packetsFor(userId).filter((packet) => packet.status === NEW_HANDOFF);
}

/** What the bell counts: grant requests waiting on the person and handoffs they have not picked up; nothing that is only news. */
export function decisionCount(userId: string): number {
  return pendingRequestsFor(userId).length + newHandoffsFor(userId).length;
}

/** Unread notifications that are read on Shared: cards shared with the person and decisions on their requests. */
export function sharedUnreadCount(userId: string): number {
  return notificationsIn(userId, "shared").filter((item) => !item.read).length;
}

export function inboxCountsFor(userId: string): InboxCounts {
  return { decisions: decisionCount(userId), sharedUnread: sharedUnreadCount(userId) };
}

function actionAlertIds(item: FeedItem): string[] {
  return item.actions.flatMap((action) => {
    const ids = action.input?.alertIds;
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  });
}

/** The alerts a to-do row already tells: its own, and those its button would hand on. */
export function alertIdsTold(items: readonly FeedItem[]): Set<string> {
  return new Set(items.flatMap((item) => [...(item.alertId ? [item.alertId] : []), ...actionAlertIds(item)]));
}

/** A to-do row with the movement of its own alert, or of the open alert whose story it tells. */
function todoOf(item: FeedItem, access: AccessContext, open: readonly Alert[]): TodoItem {
  const alert = item.alertId ? visibleAlert(item.alertId, access) : (item.story ? open.find((candidate) => storyOf(candidate) === item.story) : null) ?? null;
  return { item, movement: alert ? movementOf(alert) : null, window: alert ? windowOf(alert) : null };
}

function repliesOf(userId: string): ReplyItem[] {
  return sentPackets(userId)
    .filter((packet) => packet.thread.length > 0)
    .slice(0, MAX_ITEMS)
    .map((packet) => {
      const last = packet.thread[packet.thread.length - 1];
      return { id: packet.id, title: packet.title, toName: nameOf(packet.toUserId), text: last.text, at: last.at, status: TH.inbox.status[packet.status] };
    });
}

/** The Inbox of one person: what waits on their decision, each alert told once (a handoff or a to-do row that carries it, or a to-do row of the same story, tells it), then good news and replies. */
export async function inboxFor(access: AccessContext): Promise<InboxPayload> {
  const handoffOpen = handoffEnabled();
  const packets = undecidedHandoffsFor(access.userId).slice(0, MAX_ITEMS);
  const handoffs = await Promise.all(packets.map((packet) => handoffOf(packet, access)));
  const handedIds = new Set(packets.map((packet) => packet.id));
  const todoRows = (await todoFor(access)).filter((item) => !item.packetId || !handedIds.has(item.packetId)).slice(0, MAX_ITEMS);
  const told = alertIdsTold(todoRows);
  for (const packet of packets) for (const id of packet.alertIds) told.add(id);
  const storiesTold = new Set(todoRows.flatMap((item) => (item.story ? [item.story] : [])));

  const alertsOpen = alertsInboxEnabled();
  const dictionary = await loadDictionary();
  const open = alertsOpen ? openAlertsFor(access) : [];
  const alerts = open
    .filter((alert) => !told.has(alert.id) && !storiesTold.has(storyOf(alert)))
    .slice(0, MAX_ALERT_ITEMS)
    .map((alert) => alertOf(alert, access, handoffOpen, dictionary));

  return {
    grantRequests: pendingRequestsFor(access.userId).map(grantRequestOf),
    handoffs,
    todo: todoRows.map((item) => todoOf(item, access, open)),
    alerts,
    goodNews: await goodNewsFor(access),
    replies: repliesOf(access.userId),
    handoffOpen,
    alertsOpen,
    decisions: decisionCount(access.userId),
  };
}
