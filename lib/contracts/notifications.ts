export const NOTIFICATION_KINDS = ["alert", "email", "share", "matter", "matter_update", "staff_request", "staff_decision", "grant_request", "grant_approved", "grant_declined"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
/** `fromUserId` is who caused it; absent for Winyu's own watch and for notifications stored before it was kept. */
export type Notification = { id: string; userId: string; at: string; kind: NotificationKind; refId: string; read: boolean; title: string; fromUserId?: string };

/** One mail the demo kept instead of sending: plain `body` always, and `html` when the mail carries a button (a shared card). */
export type OutboxEntry = { id: string; at: string; kind: "email" | "watch" | "digest" | "share"; fromUserId: string; toUserId: string; toEmail: string; subject: string; body: string; html?: string; refId: string | null };
