import type { FeedItem } from "@/lib/contracts";

export type EvidenceLine = {
  label: string;
  value: string;
  summary: string;
  masked: boolean;
  denied: boolean;
  requestPrompt: string | null;
};

export type HandoffItem = {
  id: string;
  title: string;
  ask: string;
  urgency: "low" | "medium" | "high";
  sla: string | null;
  status: "open" | "accepted" | "need_info" | "returned" | "resolved";
  fromName: string;
  fromRole: string;
  evidence: EvidenceLine[];
  suggestedActions: string[];
  digest: string;
  at: string;
  outcome: string | null;
  alertCount: number;
  replies: { name: string; at: string; text: string }[];
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
  movement: { observed: string; expected: string; delta: string | null; tone: "good" | "bad" | "neutral" };
  ownerName: string;
  handoffPrompt: string | null;
};

export type ReplyItem = { id: string; title: string; toName: string; text: string; at: string; status: string };

export type InboxPayload = { todo: FeedItem[]; handoffs: HandoffItem[]; alerts: AlertItem[]; replies: ReplyItem[]; unread: number; handoffOpen: boolean };
