import type { Notification, NotificationKind } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import type { MatterEventKind } from "./matter";

/** What each kind of notification is told from: names, the card's title and the slice in words, never a value from a card. Older kinds arrive with their title already written. */
export type NotificationPayloads = {
  alert: { title: string };
  email: { title: string };
  share: { senderName: string; cardTitle: string; grantUntil: string | null };
  matter: { senderName: string; ask: string };
  matter_update: { actorName: string; cardTitle: string; change: MatterEventKind; text: string | null };
  staff_request: { requesterName: string; title: string };
  staff_decision: { approverName: string; title: string; approved: boolean };
  grant_request: { requesterName: string; slice: string };
  grant_approved: { approverName: string; slice: string; until: string };
  grant_declined: { deciderName: string; slice: string };
};

/** One event to tell someone about: its kind, the record it points at, and what its title is built from. */
export type NotificationEvent<K extends NotificationKind = NotificationKind> = { [P in K]: { kind: P; refId: string } & NotificationPayloads[P] }[K];

/** Where a notification is read: the Inbox holds what waits on the reader's decision, Shared what colleagues shared with them, the outbox mail and watches. */
export type NotificationHome = "inbox" | "shared" | "outbox";

type KindEntry<K extends NotificationKind> = { home: NotificationHome; target: (refId: string) => string; title: (payload: NotificationPayloads[K]) => string };

const COPY = TH.notify;
const OWN_TITLE = (payload: { title: string }) => payload.title;
const SHARE_PATH = (code: string) => `/s/${encodeURIComponent(code)}`;
const INBOX_PATH = "/?inbox";

/** Every notification kind: where it is read, where pressing it opens, and how its title is written. */
export const NOTIFICATION_TABLE: { [K in NotificationKind]: KindEntry<K> } = {
  alert: { home: "outbox", target: () => "/outbox", title: OWN_TITLE },
  email: { home: "outbox", target: () => "/outbox", title: OWN_TITLE },
  share: { home: "shared", target: SHARE_PATH, title: (event) => (event.grantUntil ? COPY.sharedWithGrant(event.senderName, event.cardTitle, event.grantUntil) : COPY.shared(event.senderName, event.cardTitle)) },
  matter: { home: "inbox", target: SHARE_PATH, title: (event) => COPY.matter(event.senderName, event.ask) },
  matter_update: { home: "inbox", target: SHARE_PATH, title: (event) => COPY.matterUpdate[event.change](event.actorName, event.cardTitle, event.text ?? "") },
  staff_request: { home: "inbox", target: () => INBOX_PATH, title: (event) => COPY.staffRequest(event.requesterName, event.title) },
  staff_decision: { home: "inbox", target: () => "/", title: (event) => (event.approved ? COPY.staffApproved(event.approverName, event.title) : COPY.staffDeclined(event.approverName, event.title)) },
  grant_request: { home: "inbox", target: (requestId) => `/g/${encodeURIComponent(requestId)}`, title: (event) => COPY.requested(event.requesterName, event.slice) },
  grant_approved: { home: "shared", target: SHARE_PATH, title: (event) => COPY.approved(event.approverName, event.slice, event.until) },
  grant_declined: { home: "shared", target: SHARE_PATH, title: (event) => COPY.declined(event.deciderName, event.slice) },
};

/** Where pressing a notification takes its reader. */
export function notificationTarget(notification: Pick<Notification, "kind" | "refId">): string {
  return NOTIFICATION_TABLE[notification.kind].target(notification.refId);
}

/** The title an event is shown under. */
export function notificationTitle<K extends NotificationKind>(event: NotificationEvent<K>): string {
  const entry: KindEntry<K> = NOTIFICATION_TABLE[event.kind];
  return entry.title(event);
}

/** Where a notification is read. */
export function notificationHome(kind: NotificationKind): NotificationHome {
  return NOTIFICATION_TABLE[kind].home;
}
