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
  replies: { name: string; at: string; text: string }[];
};

export type AlertItem = {
  id: string;
  severity: "P1" | "P2" | "P3";
  metric: string;
  hypothesis: string;
  verifySteps: [string, string];
  at: string;
  scope: string;
  window: string;
  movement: string;
  ownerName: string;
  handoffPrompt: string;
};

export type ReplyItem = { id: string; title: string; toName: string; text: string; at: string; status: string };

export type InboxPayload = { handoffs: HandoffItem[]; alerts: AlertItem[]; replies: ReplyItem[]; unread: number };
