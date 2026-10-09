import { describe, expect, test } from "bun:test";
import type { AlertItem, HandoffItem } from "@/components/inbox/types";
import { foldAlerts, gapRatio, handoffRowOf } from "./rows";

function alert(id: string, severity: AlertItem["severity"], scope = ""): AlertItem {
  return {
    id,
    canJudge: false,
    lesson: null,
    severity,
    metric: "ปริมาณขายเข้า (Sell-in)",
    hypothesis: "",
    verifySteps: ["", ""],
    at: "2026-09-22T06:00:00.000Z",
    scope,
    window: "",
    movement: { observed: "1", expected: "5", delta: "-80.0%", tone: "bad" },
    ownerName: "คุณอนุชา พรหมศรี",
    handoffPrompt: null,
  };
}

const HANDOFF: HandoffItem = {
  id: "h1",
  title: "อุบลศรีสุข เทรดดิ้ง แทบไม่สั่งสินค้า",
  ask: "",
  urgency: "high",
  sla: null,
  status: "open",
  fromName: "คุณอนุชา พรหมศรี",
  fromRole: "",
  evidence: [],
  suggestedActions: [],
  digest: "",
  at: "2026-10-09T09:57:55.147Z",
  outcome: null,
  alertCount: 1,
  replies: [],
};

describe("inbox rows prototype", () => {
  test("only P1 stays open and the fold counts P2 and P3 separately", () => {
    const fold = foldAlerts([alert("a", "P3"), alert("b", "P1"), alert("c", "P2"), alert("d", "P3")]);
    expect(fold.urgent.map((row) => row.id)).toEqual(["b"]);
    expect(fold.restCounts).toEqual([{ severity: "P2", count: 1 }, { severity: "P3", count: 2 }]);
  });

  test("a new handoff offers รับงาน and an accepted one offers ปิดงาน", () => {
    expect(handoffRowOf(HANDOFF, []).primary).toBe("accept");
    expect(handoffRowOf(HANDOFF, [], "accepted").primary).toBe("close");
    expect(handoffRowOf(HANDOFF, [], "resolved").primary).toBeNull();
  });

  test("a handoff takes its number from the alert its title names", () => {
    const row = handoffRowOf(HANDOFF, [alert("x", "P1", "ภาคใต้"), alert("y", "P1", "อุบลศรีสุข เทรดดิ้ง")]);
    expect(row.figure?.delta).toBe("-80.0%");
    expect(handoffRowOf(HANDOFF, [alert("x", "P1", "ภาคใต้")]).figure).toBeNull();
  });

  test("the gap bar reads both minus signs and clamps", () => {
    expect(gapRatio("-61.1%")).toBeCloseTo(0.389);
    expect(gapRatio("−77%")).toBeCloseTo(0.23);
    expect(gapRatio("+250%")).toBe(2);
    expect(gapRatio(null)).toBeNull();
  });
});
