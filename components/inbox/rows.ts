import type { AlertItem, HandoffStatus } from "./types";

export type Severity = AlertItem["severity"];

/** What a handoff row offers in its state: one primary press, the quieter moves for the "…" menu, and whether closing asks real or noise. */
export type HandoffActions = { primary: "accept" | "close" | null; menu: ("need_info" | "return")[]; verdict: boolean };

/** The P1 alerts on screen; P2 and P3 behind one line that counts each. */
export type AlertFold = { urgent: AlertItem[]; rest: AlertItem[]; restCounts: { severity: Severity; count: number }[] };

/** Widths in percent of the ควรเป็น and ตอนนี้ bars, the longer one full. */
export type Bars = { expected: number; now: number };

const URGENT: Severity = "P1";
const FOLDED: readonly Severity[] = ["P2", "P3"];
const PERCENT = 100;
const MAX_RATIO = 2;
const MIN_VISIBLE = 2;

/** A new handoff (or one where its sender was asked for more) is picked up with รับงาน; an accepted one is closed with ปิดงาน; returning or asking for more stays in the menu. */
export function handoffActions(status: HandoffStatus, alertCount: number): HandoffActions {
  if (status === "accepted") return { primary: "close", menu: ["need_info", "return"], verdict: alertCount > 0 };
  if (status === "open" || status === "need_info") return { primary: "accept", menu: ["need_info", "return"], verdict: false };
  return { primary: null, menu: [], verdict: false };
}

export function foldAlerts(items: readonly AlertItem[]): AlertFold {
  const rest = items.filter((item) => item.severity !== URGENT);
  return {
    urgent: items.filter((item) => item.severity === URGENT),
    rest,
    restCounts: FOLDED.map((severity) => ({ severity, count: rest.filter((item) => item.severity === severity).length })).filter((entry) => entry.count > 0),
  };
}

/** The two bars for observed over expected: past twice the expected the now bar stops growing, and a near-zero one still shows a sliver. */
export function barsOf(ratio: number | null): Bars | null {
  if (ratio === null || !Number.isFinite(ratio) || ratio < 0) return null;
  const clamped = Math.min(MAX_RATIO, ratio);
  const widest = Math.max(1, clamped);
  return { expected: (1 / widest) * PERCENT, now: Math.max(MIN_VISIBLE, (clamped / widest) * PERCENT) };
}
