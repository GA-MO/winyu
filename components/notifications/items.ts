import type { NotificationKind } from "@/lib/contracts";
import type { MatterBrief } from "@/lib/share/matter-actions";

/** The kinds that wait on the reader, and what the bell's one inline button does about each: take the handoff, or open the request or the matter to decide it. */
export const DECISION_ACTIONS = { handoff: "accept", grant_request: "open", matter: "open" } as const satisfies Partial<Record<NotificationKind, "accept" | "open">>;

export type DecisionKind = keyof typeof DECISION_ACTIONS;

export type Bucket = "decide" | "update";

export function isDecisionKind(kind: NotificationKind): kind is DecisionKind {
  return kind in DECISION_ACTIONS;
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

/** What pressing a decision's inline button does. */
export type DecisionAction = { type: "accept"; packetId: string } | { type: "open"; href: string };

export function decisionAction(item: BellDecision): DecisionAction {
  return DECISION_ACTIONS[item.kind] === "accept" ? { type: "accept", packetId: item.refId } : { type: "open", href: item.target };
}

/** Whether anything in the bell is unread, which is when "read all" is offered. */
export function hasUnread(payload: BellPayload): boolean {
  return [...payload.decide, ...payload.updates].some((item) => !item.read);
}
