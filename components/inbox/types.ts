import type { FeedItem } from "@/lib/contracts";
import type { MatterBrief } from "@/lib/share/matter-actions";

/** How far an alert's number moved, formatted by the server; `ratio` is observed over expected, null when that has no meaning. */
export type Movement = { observed: string; expected: string; delta: string | null; tone: "good" | "bad" | "neutral"; ratio: number | null };

export type AlertItem = {
  id: string;
  canJudge: boolean;
  lesson: string | null;
  severity: "P1" | "P2" | "P3";
  metric: string;
  hypothesis: string;
  verifySteps: string[];
  at: string;
  scope: string;
  window: string;
  movement: Movement;
  ownerName: string;
  sendPrompt: string | null;
};

/** One of Winyu's to-do rows, with the movement of the alert behind it when it has one. */
export type TodoItem = { item: FeedItem; movement: Movement | null; window: string | null };

/** A request for a temporary grant that waits on the viewer as its approver. */
export type GrantRequestItem = { id: string; requesterName: string; requesterTitle: string; slice: string; reason: string; cardTitle: string | null; at: string };

/** A leave or training request that waits on the viewer as its approver. */
export type StaffRequestItem = { id: string; system: "leave" | "course"; title: string; ask: string; requesterName: string; requesterRole: string; at: string };

/**
 * The Inbox: only what waits on the viewer's decision (grant requests, leave and training requests, matters waiting on their answer, Winyu's to-do and the alerts no to-do row or matter already covers), then the good news, folded.
 * `decisions` is what the bell counts.
 */
export type InboxPayload = {
  grantRequests: GrantRequestItem[];
  staffRequests: StaffRequestItem[];
  matters: MatterBrief[];
  todo: TodoItem[];
  alerts: AlertItem[];
  goodNews: FeedItem[];
  handoffOpen: boolean;
  alertsOpen: boolean;
  decisions: number;
};

/** What the bell and the rail show without loading the Inbox: decisions waiting, and unread shares. */
export type InboxCounts = { decisions: number; sharedUnread: number };
