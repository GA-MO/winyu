import type { InboxCounts } from "@/components/inbox/types";
import type { NotificationKind } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import type { MatterBrief } from "@/lib/share/matter-actions";

/** The kinds that wait on the reader's decision; the bell's one inline button opens where it is decided. */
export const DECISION_KINDS = ["staff_request", "grant_request", "matter"] as const satisfies readonly NotificationKind[];

export type DecisionKind = (typeof DECISION_KINDS)[number];

export type Bucket = "decide" | "update";

export function isDecisionKind(kind: NotificationKind): kind is DecisionKind {
  return (DECISION_KINDS as readonly NotificationKind[]).includes(kind);
}

/** A decision waits on the reader (the bell counts it); everything else only tells them something. */
export function bucketOf(kind: NotificationKind): Bucket {
  return isDecisionKind(kind) ? "decide" : "update";
}

export type BellPerson = { name: string; photo: string | null };

/** One row of the bell: who caused it (null when Winyu did or nobody is known), its title, when, where it opens, and the notification it reads when opened. */
export type BellItem = { key: string; kind: NotificationKind; refId: string; title: string; person: BellPerson | null; at: string; read: boolean; target: string; notificationId: string | null };

/** A decision row; a matter carries its brief, so the row shows the card, the ask and the presses in place. */
export type BellDecision = (BellItem & { kind: Exclude<DecisionKind, "matter"> }) | (BellItem & { kind: "matter"; matter: MatterBrief });

/** What the bell opens on: decisions waiting on the reader, then the latest updates. */
export type BellPayload = { decide: BellDecision[]; updates: BellItem[] };


/** What the closed bell shows: how many decisions wait on the person, else a dot for unread news (a matter passed on or taken up, a share), else nothing; and the label it reads out. */
export function bellSignal(counts: InboxCounts): { badge: number | "dot" | null; label: string } {
  if (counts.decisions > 0) return { badge: counts.decisions, label: TH.notifications.bellWaiting(counts.decisions) };
  if (counts.unreadUpdates > 0) return { badge: "dot", label: TH.notifications.bellUnread };
  return { badge: null, label: TH.notifications.bell };
}

/** Whether anything in the bell is unread, which is when "read all" is offered. */
export function hasUnread(payload: BellPayload): boolean {
  return [...payload.decide, ...payload.updates].some((item) => !item.read);
}
