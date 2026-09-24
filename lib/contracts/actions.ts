import type { WidgetKind } from "./dashboard";
import type { Region } from "./identity";
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
  /** The region the question is pinned to, stated or implied by a province or agent filter; null for the whole country. */
  region: Region | null;
  drawnAs?: WidgetKind | null;
};
