import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { sendEmailInputSchema, type Notification } from "@/lib/contracts";
import { notifications, outbox, type OutboxEntry } from "@/lib/server/agent/collections";
import { currentAccess } from "@/lib/server/request-context";
import { defineTool } from "./define";
import { ALL_BUT_SALES_REP, now, recipient } from "./shared";

function mailEntry(entry: Omit<OutboxEntry, "id" | "at">): OutboxEntry {
  return outbox().put({ ...entry, id: randomUUID(), at: now() });
}

function notify(notification: Omit<Notification, "id" | "at" | "read">): Notification {
  return notifications().put({ ...notification, id: randomUUID(), at: now(), read: false });
}

export const sendEmailTool = defineTool({
  name: "send_email",
  connector: "mail",
  tier: "write",
  roles: ALL_BUT_SALES_REP,
  description: "Send an internal email to one colleague, for example to request access to a masked metric. It lands in the demo outbox and notifies the recipient. The user approves it first.",
  input: sendEmailInputSchema,
  execute: async ({ toUserId, subject, body }: z.infer<typeof sendEmailInputSchema>) => {
    const access = currentAccess();
    const target = recipient(toUserId);
    if (!target.ok) return { ok: false as const, error: target.error };
    const entry = mailEntry({ kind: "email", fromUserId: access.userId, toUserId: target.user.id, toEmail: target.user.email, subject, body, refId: null });
    notify({ userId: target.user.id, kind: "reply", refId: entry.id, title: `อีเมลใหม่: ${subject}` });
    return { ok: true as const, summary: `ส่งอีเมลถึง ${target.user.nameTh} แล้ว`, data: { outboxId: entry.id, toEmail: target.user.email, subject } };
  },
});
