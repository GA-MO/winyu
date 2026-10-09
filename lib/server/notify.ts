import { randomUUID } from "node:crypto";
import type { Notification, NotificationKind } from "@/lib/contracts";
import { notificationTitle, type NotificationEvent } from "@/lib/share/notification-kinds";
import { notifications } from "@/lib/server/agent/collections";

/** Puts one unread notification in a person's bell, its title written by its kind. */
export function notify<K extends NotificationKind>(userId: string, event: NotificationEvent<K>, at = new Date()): Notification {
  return notifications().put({ id: randomUUID(), userId, at: at.toISOString(), kind: event.kind, refId: event.refId, read: false, title: notificationTitle(event) });
}
