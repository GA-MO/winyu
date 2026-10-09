import type { NotificationKind } from "@/lib/contracts";
import { threadGroupOf, type ThreadGroup } from "@/lib/i18n/format";

const GROUP_ORDER: readonly ThreadGroup[] = ["today", "yesterday", "week", "older"];

/** The kinds that wait on the reader, and what the bell's one inline button does about each: take the handoff, or open the request to decide it. */
export const DECISION_ACTIONS = { handoff: "accept", grant_request: "open" } as const satisfies Partial<Record<NotificationKind, "accept" | "open">>;

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

/** One row of the bell or the Shared timeline: who caused it (null when Winyu did or nobody is known), its title, when, where it opens, and the notification it reads when opened. */
export type BellItem = { key: string; kind: NotificationKind; refId: string; title: string; person: BellPerson | null; at: string; read: boolean; target: string; notificationId: string | null };

export type BellDecision = BellItem & { kind: DecisionKind };

/** What the bell opens on: decisions waiting on the reader, then the latest updates. */
export type BellPayload = { decide: BellDecision[]; updates: BellItem[] };

/** What pressing a decision's inline button does. */
export type DecisionAction = { type: "accept"; packetId: string } | { type: "open"; href: string };

export function decisionAction(item: BellDecision): DecisionAction {
  return DECISION_ACTIONS[item.kind] === "accept" ? { type: "accept", packetId: item.refId } : { type: "open", href: item.target };
}

export type ActivityGroup = { group: ThreadGroup; items: BellItem[] };

/** Updates grouped by the chat rail's day groups, newest group first, empty groups left out. */
export function activityGroups(items: readonly BellItem[], now: Date = new Date()): ActivityGroup[] {
  return GROUP_ORDER.map((group) => ({ group, items: items.filter((item) => threadGroupOf(item.at, now) === group) })).filter((entry) => entry.items.length > 0);
}

/** Whether anything in the bell is unread, which is when "read all" is offered. */
export function hasUnread(payload: BellPayload): boolean {
  return [...payload.decide, ...payload.updates].some((item) => !item.read);
}
