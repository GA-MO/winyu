import { describe, expect, test } from "bun:test";
import type { ToolStep } from "./timeline";
import { cardPlanOf, drawsNoCard } from "./tool-view";

const CARD_TOOLS: ReadonlySet<string> = new Set(["query_metric", "find_people", "get_person", "resolve_owner", "describe_entity", "list_metrics"]);
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
    expect(hiddenOf([returned("d1", "describe_entity", { kind: "user", query: "อนุชา" }, { ok: true, data: { id: "u_anucha", "ชื่อ": "คุณอนุชา พรหมศรี" } }), pending("s1", "share_card", { to: ["คุณอนุชา"] })])).toEqual(["d1"]);
  });

  test("a lookup that is the answer, or found someone else, still draws its card", () => {
    expect(hiddenOf([lookup("p1", [KRIT_ROW])])).toEqual([]);
    expect(hiddenOf([lookup("p1", [NOK_ROW]), pending("s1", "share_card", { to: ["คุณกฤต"] })])).toEqual([]);
    expect(hiddenOf([pending("s1", "share_card", { to: ["คุณกฤต"] }), lookup("p1", [KRIT_ROW])])).toEqual([]);
    expect(hiddenOf([returned("d1", "describe_entity", { kind: "agent", query: "u_krit" }, { ok: true, data: { id: "u_krit" } }), pending("h1", "create_handoff", { toUserId: "u_krit" })])).toEqual([]);
  });
});

describe("memory recalls", () => {
  const RECALL = { ok: true, summary: "จำได้", data: [], conversations: [] };

  test("two recalls in one reply draw one memory card, the last one, which holds what both found", () => {
    const steps = [returned("r1", "recall_memory", { query: "ด้ามขวาน" }, RECALL), returned("r2", "recall_memory", { query: "ลีโอ" }, RECALL)];
    expect([...cardPlanOf(steps, new Set(), new Set(["recall_memory"])).hidden]).toEqual(["r1"]);
  });

  test("a single recall draws its card", () => {
    expect([...cardPlanOf([returned("r1", "recall_memory", { query: "ลีโอ" }, RECALL)], new Set(), new Set(["recall_memory"])).hidden]).toEqual([]);
  });
});

describe("only answers draw cards (AI-63)", () => {
  const METRIC_ANSWER = { ok: true, rows: [{ region: "ภาคอีสาน", value: 1 }], summary: "s", headline: {}, provenance: {}, query: { metric: "ar_overdue", dims: ["agent"] } };
  const CATALOG = { ok: true, summary: "9 เมตริก", data: [{ id: "avg_salary" }] };
  const SCHEMA_REJECTED = { error: true, message: "Tool input validation failed for query_metric.", validationErrors: { errors: [], fields: {} } };

  test("a call the runtime rejected for its arguments draws nothing, and the corrected call that follows is the card", () => {
    const steps = [returned("q1", "query_metric", { metric: "overdue_ar" }, SCHEMA_REJECTED), returned("q2", "query_metric", { metric: "ar_overdue" }, METRIC_ANSWER)];
    expect(hiddenOf(steps)).toEqual(["q1"]);
    expect(drawsNoCard(SCHEMA_REJECTED)).toBe(true);
  });

  test("the catalog searched for a metric draws nothing, even when the reply is a refusal and nothing else answered", () => {
    expect(hiddenOf([returned("c1", "list_metrics", { search: "salary" }, CATALOG)])).toEqual(["c1"]);
    expect(hiddenOf([returned("c1", "list_metrics", { search: "สต็อค" }, CATALOG), returned("c2", "list_metrics", { search: null }, CATALOG)])).toEqual(["c1", "c2"]);
  });

  test("lookups made on the way to an answer draw nothing once another card answers", () => {
    const steps = [
      returned("p1", "get_person", { name: "กฤต จันทร์เสน", id: "u_krit" }, { ok: true, data: KRIT_ROW }),
      returned("o1", "resolve_owner", { metric: "net_sales_volume" }, { ok: true, data: { userId: "u_anucha" } }),
      returned("q1", "query_metric", { metric: "ar_overdue" }, METRIC_ANSWER),
    ];
    expect(hiddenOf(steps)).toEqual(["o1", "p1"]);
  });

  test("the whole catalog asked for on its own is the answer and draws its card", () => {
    expect(hiddenOf([returned("c1", "list_metrics", { search: null }, CATALOG)])).toEqual([]);
  });
});
