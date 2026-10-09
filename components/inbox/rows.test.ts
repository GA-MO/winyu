import { describe, expect, test } from "bun:test";
import type { AlertItem } from "./types";
import { barsOf, foldAlerts, handoffActions } from "./rows";

function alert(id: string, severity: AlertItem["severity"]): AlertItem {
  return {
    id,
    canJudge: false,
    lesson: null,
    severity,
    metric: "ปริมาณขายเข้า (Sell-in)",
    hypothesis: "",
    verifySteps: ["", ""],
    at: "2026-09-22T06:00:00.000Z",
    scope: "",
    window: "",
    movement: { observed: "1", expected: "5", delta: "-80.0%", tone: "bad", ratio: 0.2 },
    ownerName: "คุณอนุชา พรหมศรี",
    handoffPrompt: null,
  };
}

describe("inbox row model", () => {
  test("a new handoff offers รับงาน, an accepted one ปิดงาน with the verdict only when it carries an alert, a closed one nothing", () => {
    expect(handoffActions("open", 1)).toEqual({ primary: "accept", menu: ["need_info", "return"], verdict: false });
    expect(handoffActions("need_info", 0).primary).toBe("accept");
    expect(handoffActions("accepted", 1)).toEqual({ primary: "close", menu: ["need_info", "return"], verdict: true });
    expect(handoffActions("accepted", 0).verdict).toBe(false);
    expect(handoffActions("resolved", 1)).toEqual({ primary: null, menu: [], verdict: false });
    expect(handoffActions("returned", 1).primary).toBeNull();
  });

  test("only P1 stays on screen, in order, and the fold counts P2 and P3 apart", () => {
    const fold = foldAlerts([alert("a", "P3"), alert("b", "P1"), alert("c", "P2"), alert("d", "P3"), alert("e", "P1")]);
    expect(fold.urgent.map((item) => item.id)).toEqual(["b", "e"]);
    expect(fold.rest.map((item) => item.id)).toEqual(["a", "c", "d"]);
    expect(fold.restCounts).toEqual([{ severity: "P2", count: 1 }, { severity: "P3", count: 2 }]);
    expect(foldAlerts([alert("x", "P1")]).restCounts).toEqual([]);
  });

  test("bars: the longer one is full, a fall shortens now, a rise past double stops at double, and nothing to compare draws no bars", () => {
    expect(barsOf(0.389)?.expected).toBe(100);
    expect(barsOf(0.389)?.now).toBeCloseTo(38.9);
    expect(barsOf(1.5)).toEqual({ expected: (1 / 1.5) * 100, now: 100 });
    expect(barsOf(3.5)).toEqual({ expected: 50, now: 100 });
    expect(barsOf(0)).toEqual({ expected: 100, now: 2 });
    expect(barsOf(null)).toBeNull();
    expect(barsOf(-1)).toBeNull();
    expect(barsOf(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
