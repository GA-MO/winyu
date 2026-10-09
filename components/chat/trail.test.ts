import { describe, expect, test } from "bun:test";
import type { ReplyStep, ToolOutcome } from "./timeline";
import { trailOf, trailSummary, type Trail } from "./trail";

const LABELS = {};
const SALES = { metric: "net_sales_value", dims: ["region"], filters: {}, range: { from: "2026-09-01", to: "2026-09-30" } };
const RETURNED: ToolOutcome = { state: "returned", result: { ok: true, rows: [{ region: "อีสาน", value: 4210000 }] } };
const PENDING: ToolOutcome = { state: "pending" };

function call(id: string, name: string, args: unknown, outcome: ToolOutcome): ReplyStep {
  return { kind: "tool", toolCallId: id, name, args, outcome };
}

function states(trail: Trail) {
  return trail.entries.map((entry) => [entry.action.action, entry.state]);
}

describe("trailOf", () => {
  test("before the first step the agent is planning", () => {
    expect(trailOf([], true, LABELS)).toEqual({ entries: [], pause: "planning" });
  });

  test("a call running is the current line, finished calls before it are checked, and no pause shows", () => {
    const trail = trailOf([call("a", "get_alerts", {}, RETURNED), call("b", "query_metric", SALES, PENDING)], true, LABELS);
    expect(states(trail)).toEqual([["ดูความผิดปกติ", "done"], ["ดึงมูลค่าขายเข้า", "running"]]);
    expect(trail.pause).toBeNull();
  });

  test("calls made together all run at once and finish one by one", () => {
    const together = [call("a", "query_metric", SALES, PENDING), call("b", "get_alerts", {}, PENDING)];
    expect(states(trailOf(together, true, LABELS)).map(([, state]) => state)).toEqual(["running", "running"]);
    expect(states(trailOf([together[0], call("b", "get_alerts", {}, RETURNED)], true, LABELS)).map(([, state]) => state)).toEqual(["running", "done"]);
  });

  test("between steps after results came back the agent is reading them; once text streams it is not paused", () => {
    expect(trailOf([call("a", "query_metric", SALES, RETURNED)], true, LABELS).pause).toBe("reading");
    expect(trailOf([call("a", "query_metric", SALES, RETURNED), { kind: "text", id: "t", text: "อีสานต่ำกว่าเป้า" }], true, LABELS).pause).toBeNull();
  });

  test("a refused or failed call reads as not done; once the answer ends a read never left pending and a write it prepared is done", () => {
    const refused = call("a", "query_metric", SALES, { state: "returned", result: { ok: false, error: "denied" } });
    const failed = call("b", "get_alerts", {}, { state: "failed", error: "boom" });
    const stopped = call("c", "find_people", {}, PENDING);
    const prepared = call("d", "pin_widget", { title: "ยอดขาย" }, PENDING);
    const trail = trailOf([refused, failed, stopped, prepared], false, LABELS);
    expect(states(trail).map(([, state]) => state)).toEqual(["failed", "failed", "failed", "done"]);
    expect(trail.pause).toBeNull();
  });
});

describe("trailSummary", () => {
  test("a finished answer collapses to the sources it read and how long it took", () => {
    const trail = trailOf([call("a", "query_metric", SALES, RETURNED), call("b", "get_alerts", {}, RETURNED), call("c", "explain_gap", {}, RETURNED)], false, LABELS);
    expect(trailSummary(trail, 4230)).toBe("ใช้ข้อมูล 3 แหล่ง · 4.2 วินาที");
    expect(trailSummary(trail, null)).toBe("ใช้ข้อมูล 3 แหล่ง");
  });

  test("an answer that only prepared a request counts the request; one that called nothing keeps no line", () => {
    expect(trailSummary(trailOf([call("a", "pin_widget", {}, PENDING)], false, LABELS), 1500)).toBe("เตรียมคำขอ 1 รายการ · 1.5 วินาที");
    expect(trailSummary(trailOf([{ kind: "text", id: "t", text: "สวัสดีครับ" }], false, LABELS), 900)).toBeNull();
  });
});
