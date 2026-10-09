import type { FeedItem } from "@/lib/contracts";

export type EvidenceLine = {
  label: string;
  value: string;
  summary: string;
  masked: boolean;
  denied: boolean;
  requestPrompt: string | null;
};

/** How far an alert's number moved, formatted by the server; `ratio` is observed over expected, null when that has no meaning. */
export type Movement = { observed: string; expected: string; delta: string | null; tone: "good" | "bad" | "neutral"; ratio: number | null };

export type HandoffStatus = "open" | "accepted" | "need_info" | "returned" | "resolved";

/** A handoff sent to the viewer, with the movement and period of the alert it was raised on when the viewer may see that alert. */
export type HandoffItem = {
  id: string;
  title: string;
  ask: string;
  urgency: "low" | "medium" | "high";
  sla: string | null;
  status: HandoffStatus;
  fromName: string;
  fromRole: string;
  evidence: EvidenceLine[];
  suggestedActions: string[];
  digest: string;
  at: string;
  outcome: string | null;
  alertCount: number;
  replies: { name: string; at: string; text: string }[];
  movement: Movement | null;
  window: string | null;
};

export type AlertItem = {
  id: string;
  canJudge: boolean;
  lesson: string | null;
  severity: "P1" | "P2" | "P3";
  metric: string;
  hypothesis: string;
  verifySteps: [string, string];
  at: string;
  scope: string;
  window: string;
  movement: Movement;
  ownerName: string;
  handoffPrompt: string | null;
};

/** One of Winyu's to-do rows, with the movement of the alert behind it when it has one. */
export type TodoItem = { item: FeedItem; movement: Movement | null; window: string | null };

/** A request for a temporary grant that waits on the viewer as its approver. */
export type GrantRequestItem = { id: string; requesterName: string; requesterTitle: string; slice: string; reason: string; cardTitle: string | null; at: string };

export type ReplyItem = { id: string; title: string; toName: string; text: string; at: string; status: string };

/**
 * The Inbox: only what waits on the viewer's decision (grant requests, handoffs to them, Winyu's to-do and the alerts no to-do row already covers), then the good news and the replies to what they sent, folded.
 * `decisions` is what the bell counts.
 */
export type InboxPayload = {
  grantRequests: GrantRequestItem[];
  handoffs: HandoffItem[];
  todo: TodoItem[];
  alerts: AlertItem[];
  goodNews: FeedItem[];
  replies: ReplyItem[];
  handoffOpen: boolean;
  alertsOpen: boolean;
  decisions: number;
};

/** What the bell and the rail show without loading the Inbox: decisions waiting, and unread shares. */
export type InboxCounts = { decisions: number; sharedUnread: number };
