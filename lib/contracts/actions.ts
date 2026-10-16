import type { WidgetKind } from "./dashboard";
import type { Region } from "./identity";
import type { ResolvedQuery } from "./semantic";

export type NextActionKind = "handoff" | "request_access" | "pin" | "verify" | "drill" | "enroll";

/** One thing the user can do next about a result: a tool call the card offers as a button, or a follow-up question. */
export type NextAction = {
  id: string;
  kind: NextActionKind;
  label: string;
  reason: string;
  tool: "create_handoff" | "send_email" | "pin_widget" | "enroll_course" | null;
  input: Record<string, unknown> | null;
  prompt: string | null;
};

/** What a card is about, decided once for its handoff, its pin and its follow-up questions. */
export type CardFocus = {
  /** What the whole card covers, in Thai: the values it is narrowed to, and "แยกตาม…" for a breakdown; null for everything the viewer may see. Names a pinned tile. */
  slice: string | null;
  /** The breakdown row the card points at: the row of the alert in question, the row the question pinned, else the worst row; null when there is none. Names the why and drill-down questions. */
  row: string | null;
  /** What work handed on from this card is about: the alert in question, else the row, else the slice. Names the handoff's title and ask. */
  subject: string | null;
};

export type NextActionContext = {
  query: ResolvedQuery;
  focus: CardFocus;
  deltaPercent: number | null;
  masked: string[];
  alertIds: string[];
  verifyStep: string | null;
  /** The region id the card's work belongs to, from its pinned slice or the alert it is about; null for the whole country. */
  region: Region | null;
  drawnAs?: WidgetKind | null;
};
