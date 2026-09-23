import type { Dim, MetricId } from "./semantic";

export type ActionEvent = { id: string; userId: string; at: string; kind: "question" | "quick_action" | "pin" | "dismiss" | "handoff" | "alert_open" | "widget_view" | "follow_up";
  intentKey: string; metric: MetricId | null; dims: Dim[]; prompt: string | null; threadId: string | null };
export type QuickAction = { id: string; label: string; prompt: string; score: number; reason: string; intentKey: string };
