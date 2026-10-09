import type { Notification, NotificationKind } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";

/** What each kind of notification is told from: names, the card's title and the slice in words, never a value from a card. Older kinds arrive with their title already written. */
export type NotificationPayloads = {
  handoff: { title: string };
  alert: { title: string };
  reply: { title: string };
  email: { title: string };
  share: { senderName: string; cardTitle: string; grantUntil: string | null };
  grant_request: { requesterName: string; slice: string };
  grant_approved: { approverName: string; slice: string; until: string };
  grant_declined: { deciderName: string; slice: string };
};

/** One event to tell someone about: its kind, the record it points at, and what its title is built from. */
export type NotificationEvent<K extends NotificationKind = NotificationKind> = { [P in K]: { kind: P; refId: string } & NotificationPayloads[P] }[K];

type KindEntry<K extends NotificationKind> = { target: (refId: string) => string; title: (payload: NotificationPayloads[K]) => string };

const COPY = TH.notify;
const OWN_TITLE = (payload: { title: string }) => payload.title;
const SHARE_PATH = (code: string) => `/s/${encodeURIComponent(code)}`;

/** Every notification kind: where pressing it opens, and how its title is written. */
export const NOTIFICATION_TABLE: { [K in NotificationKind]: KindEntry<K> } = {
  handoff: { target: (packetId) => `/c/new?preload=${encodeURIComponent(packetId)}`, title: OWN_TITLE },
  alert: { target: () => "/outbox", title: OWN_TITLE },
  reply: { target: () => "/?inbox=replies", title: OWN_TITLE },
  email: { target: () => "/outbox", title: OWN_TITLE },
  share: { target: SHARE_PATH, title: (event) => (event.grantUntil ? COPY.sharedWithGrant(event.senderName, event.cardTitle, event.grantUntil) : COPY.shared(event.senderName, event.cardTitle)) },
  grant_request: { target: (requestId) => `/g/${encodeURIComponent(requestId)}`, title: (event) => COPY.requested(event.requesterName, event.slice) },
  grant_approved: { target: SHARE_PATH, title: (event) => COPY.approved(event.approverName, event.slice, event.until) },
  grant_declined: { target: SHARE_PATH, title: (event) => COPY.declined(event.deciderName, event.slice) },
};

/** The title an event is shown under. */
export function notificationTitle<K extends NotificationKind>(event: NotificationEvent<K>): string {
  const entry: KindEntry<K> = NOTIFICATION_TABLE[event.kind];
  return entry.title(event);
}

/** Where pressing a notification takes its reader. */
export function notificationTarget(notification: Pick<Notification, "kind" | "refId">): string {
  return NOTIFICATION_TABLE[notification.kind].target(notification.refId);
}
