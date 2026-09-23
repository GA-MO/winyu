import type { WidgetKind } from "./dashboard";
import type { MetricQuery } from "./semantic";

export type NextActionKind = "handoff" | "request_access" | "pin" | "verify" | "drill";

/** One thing the user can do next about a result: a tool call the card offers as a button, or a follow-up question. */
export type NextAction = {
  id: string;
  kind: NextActionKind;
  label: string;
  reason: string;
  tool: "create_handoff" | "send_email" | "pin_widget" | null;
  input: Record<string, unknown> | null;
  prompt: string | null;
};

export type NextActionContext = {
  title: string;
  query: MetricQuery;
  deltaPercent: number | null;
  masked: string[];
  topLabel: string | null;
  alertIds: string[];
  alertScope: string | null;
  verifyStep: string | null;
  drawnAs?: WidgetKind | null;
};
