import { describe, expect, test } from "bun:test";
import type { ToolStep } from "./timeline";
import { cardPlanOf } from "./tool-view";

const CARD_TOOLS: ReadonlySet<string> = new Set(["query_metric", "find_people", "get_person", "resolve_owner", "list_metrics"]);
const KRIT_ROW = { id: "u_krit", name: "คุณกฤต จันทร์เสน", title: "พนักงานขาย ขอนแก่น" };
const NOK_ROW = { id: "u_nok", name: "คุณนก สุขสวัสดิ์", title: "พนักงานขาย บุรีรัมย์" };

function returned(toolCallId: string, name: string, args: unknown, result: unknown): ToolStep {
  return { kind: "tool", toolCallId, name, args, outcome: { state: "returned", result } };
}

function pending(toolCallId: string, name: string, args: unknown): ToolStep {
  return { kind: "tool", toolCallId, name, args, outcome: { state: "pending" } };
}

function lookup(toolCallId: string, rows: unknown[]): ToolStep {
  return returned(toolCallId, "find_people", { query: "กฤต" }, { ok: true, data: rows, open_positions: [] });
}

function hiddenOf(steps: ToolStep[]): string[] {
  return [...cardPlanOf(steps, new Set(), CARD_TOOLS).hidden].sort();
}

describe("a people lookup on the way to an action is not the answer", () => {
  test("the lookup that found the recipient of a share, a handoff or an email draws no card", () => {
    expect(hiddenOf([lookup("p1", [KRIT_ROW]), pending("s1", "share_card", { to: ["คุณกฤต"] })])).toEqual(["p1"]);
    expect(hiddenOf([lookup("p1", [KRIT_ROW]), pending("s1", "share_card", { to: ["u_krit"] })])).toEqual(["p1"]);
    expect(hiddenOf([lookup("p1", [NOK_ROW, KRIT_ROW]), pending("h1", "create_handoff", { toUserId: "u_krit" })])).toEqual(["p1"]);
    expect(hiddenOf([returned("o1", "resolve_owner", {}, { ok: true, data: { userId: "u_krit", nameTh: "คุณกฤต จันทร์เสน" } }), pending("e1", "send_email", { toUserId: "u_krit" })])).toEqual(["o1"]);
  });

  test("a lookup that is the answer, or found someone else, still draws its card", () => {
    expect(hiddenOf([lookup("p1", [KRIT_ROW])])).toEqual([]);
    expect(hiddenOf([lookup("p1", [NOK_ROW]), pending("s1", "share_card", { to: ["คุณกฤต"] })])).toEqual([]);
    expect(hiddenOf([pending("s1", "share_card", { to: ["คุณกฤต"] }), lookup("p1", [KRIT_ROW])])).toEqual([]);
  });
});
