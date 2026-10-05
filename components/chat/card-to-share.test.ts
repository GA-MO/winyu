import { describe, expect, test } from "bun:test";
import type { ShareTarget } from "@/lib/share/card";
import { cardsBeforeEach, newestCardOf } from "./card-to-share";
import type { Exchange, ToolStep } from "./timeline";

const CARD_TOOLS: ReadonlySet<string> = new Set(["query_metric", "find_people", "get_person", "resolve_owner", "list_metrics"]);
const BY_REGION = { metric: "net_sales_value", dims: ["region"] };
const KRIT_ROW = { id: "u_krit", name: "คุณกฤต จันทร์เสน", title: "พนักงานขาย ขอนแก่น" };

function returned(toolCallId: string, name: string, args: unknown, result: unknown): ToolStep {
  return { kind: "tool", toolCallId, name, args, outcome: { state: "returned", result } };
}

function pending(toolCallId: string, name: string, args: unknown): ToolStep {
  return { kind: "tool", toolCallId, name, args, outcome: { state: "pending" } };
}

function lookup(toolCallId: string, rows: unknown[]): ToolStep {
  return returned(toolCallId, "find_people", { query: "กฤต" }, { ok: true, data: rows, open_positions: [] });
}

function exchange(id: string, question: string, steps: ToolStep[]): Exchange {
  return { id, question: { kind: "typed", text: question }, steps };
}

const SALES = exchange("q1", "ยอดขายแยกตามภาคเดือนนี้", [returned("m1", "query_metric", BY_REGION, { ok: true, rows: [{ region: "ภาคอีสาน" }] })]);

describe("the card ส่งการ์ดนี้ means", () => {
  test("is the newest card an earlier exchange drew, skipping a recipient lookup", () => {
    const share = exchange("q2", "ส่งการ์ดนี้ให้คุณกฤตดูหน่อย", [lookup("p1", [KRIT_ROW]), pending("s1", "share_card", { to: ["คุณกฤต"] })]);
    const expected: ShareTarget = { card: { kind: "tool", reads: [{ tool: "query_metric", input: BY_REGION }] }, question: "ยอดขายแยกตามภาคเดือนนี้" };
    expect(cardsBeforeEach([SALES, share], CARD_TOOLS)).toEqual([null, expected]);
    expect(newestCardOf([SALES, share], CARD_TOOLS)).toEqual(expected);
  });

  test("is the people card when the lookup was the answer", () => {
    const team = exchange("q2", "คุณกฤตอยู่ทีมไหน", [lookup("p1", [KRIT_ROW])]);
    expect(newestCardOf([SALES, team], CARD_TOOLS)?.card).toEqual({ kind: "tool", reads: [{ tool: "find_people", input: { query: "กฤต" } }] });
  });

  test("is never a refusal, an empty answer or the metric catalog, and is none in a conversation without a card", () => {
    const refused = exchange("q2", "กำไร", [returned("m2", "query_metric", BY_REGION, { ok: false, error: "PERMISSION_DENIED" })]);
    const empty = exchange("q3", "ยอดว่าง", [returned("m3", "query_metric", BY_REGION, { ok: true, rows: [] })]);
    const catalog = exchange("q4", "มี metric อะไรบ้าง", [returned("c1", "list_metrics", {}, { ok: true, metrics: [{ id: "x" }] })]);
    expect(newestCardOf([SALES, refused, empty, catalog], CARD_TOOLS)?.question).toBe("ยอดขายแยกตามภาคเดือนนี้");
    expect(newestCardOf([refused, empty, catalog], CARD_TOOLS)).toBeNull();
    expect(newestCardOf([], CARD_TOOLS)).toBeNull();
  });
});
