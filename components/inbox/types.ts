export type EvidenceLine = { label: string; value: string };

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
};

export type ReplyItem = { id: string; title: string; toName: string; text: string; at: string; status: string };

export type InboxPayload = { handoffs: HandoffItem[]; alerts: AlertItem[]; replies: ReplyItem[]; unread: number };
