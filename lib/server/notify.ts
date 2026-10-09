import { randomUUID } from "node:crypto";
import type { Notification, NotificationKind } from "@/lib/contracts";
import { notificationHome, notificationTitle, type NotificationEvent, type NotificationHome } from "@/lib/share/notification-kinds";
import { notifications } from "@/lib/server/agent/collections";

/** Puts one unread notification in a person's bell, its title written by its kind. */
export function notify<K extends NotificationKind>(userId: string, event: NotificationEvent<K>, at = new Date()): Notification {
  return notifications().put({ id: randomUUID(), userId, at: at.toISOString(), kind: event.kind, refId: event.refId, read: false, title: notificationTitle(event) });
}

/** A person's notifications that live in one home, newest first. */
export function notificationsIn(userId: string, home: NotificationHome): Notification[] {
  return notifications()
    .where((item) => item.userId === userId && notificationHome(item.kind) === home)
    .sort((left, right) => right.at.localeCompare(left.at));
}

/** Marks read a person's notifications in one home, once they opened it. */
export function markHomeRead(userId: string, home: NotificationHome): void {
  const store = notifications();
  for (const item of notificationsIn(userId, home)) if (!item.read) store.put({ ...item, read: true });
}
