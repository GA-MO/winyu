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
  test("the lookup that found the recipient of a sent card or an email draws no card", () => {
    expect(hiddenOf([lookup("p1", [KRIT_ROW]), pending("s1", "send_card", { to: ["คุณกฤต"] })])).toEqual(["p1"]);
    expect(hiddenOf([lookup("p1", [KRIT_ROW]), pending("s1", "send_card", { to: ["u_krit"] })])).toEqual(["p1"]);
    expect(hiddenOf([lookup("p1", [NOK_ROW, KRIT_ROW]), pending("h1", "send_email", { toUserId: "u_krit" })])).toEqual(["p1"]);
    expect(hiddenOf([returned("o1", "resolve_owner", {}, { ok: true, data: { userId: "u_krit", nameTh: "คุณกฤต จันทร์เสน" } }), pending("e1", "send_email", { toUserId: "u_krit" })])).toEqual(["o1"]);
    expect(hiddenOf([returned("d1", "describe_entity", { kind: "user", query: "อนุชา" }, { ok: true, data: { id: "u_anucha", "ชื่อ": "คุณอนุชา พรหมศรี" } }), pending("s1", "send_card", { to: ["คุณอนุชา"] })])).toEqual(["d1"]);
  });

  test("a lookup that is the answer still draws its card when the reply wrote a card block", () => {
    expect(hiddenOf([lookup("p1", [KRIT_ROW])])).toEqual([]);
  });
});

describe("lookups on refusals and sends draw nothing (AI-100)", () => {
  const ANUCHA = { ok: true, summary: "คุณอนุชา พรหมศรี · บางช่องถูกปิดตามสิทธิ์ของผู้ใช้", data: { id: "u_anucha", name: "คุณอนุชา พรหมศรี", facts: [] } };
  const NOK = { ok: true, summary: "คุณนก สุขสวัสดิ์", data: { id: "u_nok", name: "คุณนก สุขสวัสดิ์", facts: [] } };
  const CENTRAL_OWNER = { ok: true, summary: "ผู้รับผิดชอบคือ คุณสมชาย บุญมี", data: { userId: "u_somchai", nameTh: "คุณสมชาย บุญมี" } };
  const AGENT_RECORD = { ok: true, data: { id: "ag_sou_02", "ชื่อ": "สงขลาทักษิณ เทรดดิ้ง" } };

  function hiddenInWords(steps: ToolStep[]): string[] {
    return [...cardPlanOf(steps, new Set(), CARD_TOOLS, false).hidden].sort();
  }

  test("a refusal written in words draws no HR profile and no owner card", () => {
    expect(hiddenInWords([returned("p1", "get_person", { name: "อนุชา" }, ANUCHA), returned("p2", "get_person", { id: "u_nok" }, NOK)])).toEqual(["p1", "p2"]);
    expect(hiddenInWords([returned("o1", "resolve_owner", { metric: "net_sales_volume", dims: { region: "central" } }, CENTRAL_OWNER)])).toEqual(["o1"]);
  });

  test("a send or an email draws none of the lookups it made on the way, whoever they found and in whatever order", () => {
    expect(hiddenOf([returned("e1", "describe_entity", { kind: "agent", query: "สงขลาทักษิณ" }, AGENT_RECORD), pending("s1", "send_card", { to: ["u_arm"] })])).toEqual(["e1"]);
    expect(hiddenOf([lookup("p1", [NOK_ROW]), pending("s1", "send_card", { to: ["คุณกฤต"] })])).toEqual(["p1"]);
    expect(hiddenOf([pending("s1", "send_card", { to: ["คุณกฤต"] }), lookup("p1", [KRIT_ROW])])).toEqual(["p1"]);
    expect(hiddenOf([returned("p1", "get_person", { name: "กฤต จันทร์เสน" }, { ok: true, data: { ...KRIT_ROW, badges: [{ label: "ใบอนุญาตขายสุรา 23 วัน" }] } }), pending("s1", "send_card", { to: ["u_anucha"] })])).toEqual(["p1"]);
    expect(hiddenOf([returned("d1", "describe_entity", { kind: "agent", query: "u_krit" }, { ok: true, data: { id: "u_krit" } }), pending("h1", "send_email", { toUserId: "u_krit" })])).toEqual(["d1"]);
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
