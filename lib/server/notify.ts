import { randomUUID } from "node:crypto";
import type { Notification, NotificationKind } from "@/lib/contracts";
import { notificationHome, notificationTitle, type NotificationEvent, type NotificationHome } from "@/lib/share/notification-kinds";
import { notifications } from "@/lib/server/agent/collections";

/** Puts one unread notification in a person's bell, its title written by its kind; `from` is who caused it, null when Winyu did. */
export function notify<K extends NotificationKind>(userId: string, from: string | null, event: NotificationEvent<K>, at = new Date()): Notification {
  const sender = from ? { fromUserId: from } : {};
  return notifications().put({ id: randomUUID(), userId, at: at.toISOString(), kind: event.kind, refId: event.refId, read: false, title: notificationTitle(event), ...sender });
}

/** A person's notifications, newest first. */
export function notificationsOf(userId: string): Notification[] {
  return notifications()
    .where((item) => item.userId === userId)
    .sort((left, right) => right.at.localeCompare(left.at));
}

/** A person's notifications that live in one home, newest first. */
export function notificationsIn(userId: string, home: NotificationHome): Notification[] {
  return notificationsOf(userId).filter((item) => notificationHome(item.kind) === home);
}

function markRead(items: readonly Notification[]): void {
  const store = notifications();
  for (const item of items) if (!item.read) store.put({ ...item, read: true });
}

/** Marks read a person's notifications in one home, once they opened it. */
export function markHomeRead(userId: string, home: NotificationHome): void {
  markRead(notificationsIn(userId, home));
}

/** Marks read the one notification the person opened; someone else's is left alone. */
export function markOneRead(userId: string, id: string): void {
  markRead(notificationsOf(userId).filter((item) => item.id === id));
}

/** Marks read every notification the person has. */
export function markAllRead(userId: string): void {
  markRead(notificationsOf(userId));
}
