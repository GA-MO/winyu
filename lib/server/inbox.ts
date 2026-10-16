import type { AccessContext, Alert, Dim, FeedItem, GrantRequest } from "@/lib/contracts";
import type { AlertItem, GrantRequestItem, InboxCounts, InboxPayload, Movement, StaffRequestItem, TodoItem } from "@/components/inbox/types";
import { bucketOf } from "@/components/notifications/items";
import { alertsInboxEnabled, handoffEnabled, isToolAllowed } from "@/lib/access/enforce";
import { verifyStepsFor } from "@/lib/access/verify-steps";
import { findUser } from "@/lib/data/entities/users";
import { formatDelta, formatMetricValue, metricLabel, toneOf } from "@/lib/dashboard/metric-display";
import { formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import type { Dictionary } from "@/lib/semantic/dictionary";
import { sliceLabel } from "@/lib/share/grant-label";
import { canJudge, openAlertsFor, visibleAlert } from "@/lib/server/alerts";
import { goodNewsFor, storyOf, todoFor } from "@/lib/server/feed";
import { grantRequests } from "@/lib/server/grants";
import { loadDictionary } from "@/lib/server/master-data";
import { notificationsIn, notificationsOf } from "@/lib/server/notify";
import { lessonFor } from "@/lib/server/outcomes";
import { mattersWaitingOn, shares } from "@/lib/server/share/shares";
import { briefOf } from "@/lib/server/share/act";
import { pendingStaffRequestsFor, type StaffRequest } from "@/lib/server/staff-requests";

const MAX_ITEMS = 20;
const MAX_ALERT_ITEMS = 60;
const PERCENT = 100;
const SCOPE_ORDER: Dim[] = ["agent", "dc", "plant", "sku", "brand", "channel", "province", "region"];

function nameOf(userId: string): string {
  return findUser(userId)?.nameTh ?? userId;
}

function roleOf(userId: string): string {
  const user = findUser(userId);
  return user ? TH.role[user.role] : "";
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

function alertOf(alert: Alert, access: AccessContext, mayTell: boolean, dictionary: Dictionary): AlertItem {
  const owner = findUser(alert.ownerUserId);
  const scope = scopeOf(alert, dictionary);
  return {
    id: alert.id,
    canJudge: canJudge(alert, access),
    lesson: lessonFor(alert),
    severity: alert.severity,
    metric: metricLabel(alert.metric),
    hypothesis: alert.hypothesis,
    verifySteps: verifyStepsFor(access, alert),
    at: alert.at,
    scope,
    window: windowOf(alert),
    movement: movementOf(alert),
    ownerName: owner?.nameTh ?? "",
    sendPrompt: mayTell && owner && owner.id !== access.userId ? TH.inbox.sendPrompt(metricLabel(alert.metric), scope, owner.nameTh) : null,
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

function staffRequestOf(request: StaffRequest): StaffRequestItem {
  return { id: request.id, system: request.system, title: request.title, ask: request.ask, requesterName: nameOf(request.employeeId), requesterRole: roleOf(request.employeeId), at: request.createdAt };
}

/** What the bell counts: grant requests and leave or training requests waiting on the person, and matters waiting on their answer; nothing that is only news. */
export function decisionCount(userId: string): number {
  return pendingRequestsFor(userId).length + pendingStaffRequestsFor(userId).length + mattersWaitingOn(userId).length;
}

/** Unread notifications that are read on Shared: cards shared with the person and decisions on their requests. */
export function sharedUnreadCount(userId: string): number {
  return notificationsIn(userId, "shared").filter((item) => !item.read).length;
}

/** Unread notifications that wait on nothing (a matter passed on or taken up, a share, an answer): the bell shows a dot for them. */
export function unreadUpdateCount(userId: string): number {
  return notificationsOf(userId).filter((item) => !item.read && bucketOf(item.kind) === "update").length;
}

export function inboxCountsFor(userId: string): InboxCounts {
  return { decisions: decisionCount(userId), sharedUnread: sharedUnreadCount(userId), unreadUpdates: unreadUpdateCount(userId) };
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

/** The Inbox of one person: what waits on their decision, each alert told once (a matter or a to-do row that carries it, or a to-do row of the same story, tells it), then good news. */
export async function inboxFor(access: AccessContext): Promise<InboxPayload> {
  const handoffOpen = handoffEnabled();
  const mayTell = handoffOpen && isToolAllowed(access, "send_card");
  const matters = mattersWaitingOn(access.userId).slice(0, MAX_ITEMS);
  const todoRows = (await todoFor(access)).slice(0, MAX_ITEMS);
  const told = alertIdsTold(todoRows);
  for (const matter of matters) for (const id of matter.alertIds) told.add(id);
  const storiesTold = new Set(todoRows.flatMap((item) => (item.story ? [item.story] : [])));

  const alertsOpen = alertsInboxEnabled();
  const dictionary = await loadDictionary();
  const open = alertsOpen ? openAlertsFor(access) : [];
  const alerts = open
    .filter((alert) => !told.has(alert.id) && !storiesTold.has(storyOf(alert)))
    .slice(0, MAX_ALERT_ITEMS)
    .map((alert) => alertOf(alert, access, mayTell, dictionary));

  return {
    grantRequests: pendingRequestsFor(access.userId).map(grantRequestOf),
    staffRequests: pendingStaffRequestsFor(access.userId).map(staffRequestOf),
    matters: matters.map((matter) => briefOf(matter, access.userId)),
    todo: todoRows.map((item) => todoOf(item, access, open)),
    alerts,
    goodNews: await goodNewsFor(access),
    handoffOpen,
    alertsOpen,
    decisions: decisionCount(access.userId),
  };
}
