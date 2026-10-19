import { describe, expect, test } from "bun:test";
import type { ToolStep } from "./timeline";
import { cardPlanOf, drawsNoCard, recallSourcesOf } from "./tool-view";

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

  test("a recall that found past conversations and no facts draws its card, so the person can open them (AI-344); one that found nothing is said in words", () => {
    const conversation = { threadId: "t_ar", title: "หนี้ค้างชำระภาคใต้", at: "2026-10-19T09:00:00.000Z", question: "หนี้ค้างชำระภาคใต้ตอนนี้เป็นยังไง", reply: "สูงขึ้น", queries: [], score: 0.86 };
    expect(drawsNoCard({ ...RECALL, conversations: [conversation] })).toBe(false);
    expect(drawsNoCard(RECALL)).toBe(true);
  });
});

describe("the conversation an answer came from", () => {
  const ATTRITION = { metric: "attrition_rate", dims: ["department"] };
  const TURNOVER = { threadId: "t_turnover", title: "พนักงานลาออกแผนกไหนเยอะสุด", at: "2026-10-20T03:00:00.000Z", question: "พนักงานลาออกแผนกไหนเยอะสุด", reply: "ฝ่ายการตลาด", queries: [ATTRITION], score: 0.83 };
  const SALES = { threadId: "t_sales", title: "ยอดขายเดือนนี้แยกภาค", at: "2026-10-19T03:00:00.000Z", question: "ยอดขายเดือนนี้แยกภาค", reply: "กรุงเทพฯ สูงสุด", queries: [{ metric: "net_sales_value", dims: ["region"] }], score: 0.85 };
  const ANSWER = { ok: true, rows: [{ department: "การตลาด", value: 1 }], summary: "s", headline: {}, provenance: {}, query: ATTRITION };
  const recall = (conversations: unknown[]) => returned("r1", "recall_memory", { query: "แผนก" }, { ok: true, summary: "จำได้", data: [], conversations });

  function sourcesOf(steps: ToolStep[]) {
    return recallSourcesOf(steps, cardPlanOf(steps, new Set(), new Set([...CARD_TOOLS, "recall_memory"])));
  }

  test("an answer card that hides the memory card names the conversation whose query it asked again, not the closer one it did not use (AI-344)", () => {
    expect(sourcesOf([recall([SALES, TURNOVER]), returned("q1", "query_metric", ATTRITION, ANSWER)])).toEqual([{ threadId: "t_turnover", title: TURNOVER.title, at: TURNOVER.at }]);
  });

  test("with no query in common it names the closest conversation", () => {
    expect(sourcesOf([recall([SALES, TURNOVER]), returned("q1", "query_metric", { metric: "headcount" }, { ...ANSWER, query: { metric: "headcount" } })]).map((source) => source.threadId)).toEqual(["t_sales"]);
  });

  test("names nothing when the memory card itself is drawn or the recall found no conversation", () => {
    expect(sourcesOf([recall([TURNOVER])])).toEqual([]);
    expect(sourcesOf([recall([]), returned("q1", "query_metric", ATTRITION, ANSWER)])).toEqual([]);
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

  test("a scope refusal that offers a request for access stays on screen beside the other side of the comparison, so the reply's 'ปุ่มบนการ์ด' is there to press (AI-211)", () => {
    const denied = { ok: false, code: "PERMISSION_DENIED", error: "อยู่นอกขอบเขต", nextActions: [{ id: "request", kind: "request_access", label: "ขอสิทธิ์จากคุณประสิทธิ์" }] };
    const steps = [returned("q1", "query_metric", { filters: { region: ["south"] } }, denied), returned("q2", "query_metric", { filters: { region: ["northeast"] } }, METRIC_ANSWER)];
    expect(hiddenOf(steps)).toEqual([]);
    expect(drawsNoCard(denied)).toBe(false);
    const bare = { ok: false, code: "PERMISSION_DENIED", error: "อยู่นอกขอบเขต" };
    expect(hiddenOf([returned("q1", "query_metric", { filters: { region: ["south"] } }, bare), returned("q2", "query_metric", { filters: { region: ["northeast"] } }, METRIC_ANSWER)])).toEqual(["q1"]);
  });

  test("the whole catalog asked for on its own is the answer and draws its card", () => {
    expect(hiddenOf([returned("c1", "list_metrics", { search: null }, CATALOG)])).toEqual([]);
  });
});

describe("a why answer draws one card per point (AI-253)", () => {
  const WHY_TOOLS: ReadonlySet<string> = new Set(["query_metric", "explain_gap", "get_alerts"]);
  const WEEK = { from: "2026-11-23", to: "2026-11-26" };
  const WEEK_TOTAL = { ok: true, rows: [{ value: 248123456, value_label: "248.1 ล้านบาท", delta_pct: -9.3 }], summary: "", headline: { value: "248.1 ล้านบาท", deltaPercent: -9.3 }, query: { metric: "net_sales_value", dims: [], filters: {}, range: WEEK, grain: "week", compare: "prev_period", limit: null } };
  const WEEK_ARGS = { dims: [], period: "this_week", metric: "net_sales_value", filters: {}, grain: "week", compare: "prev_period" };
  const SPREAD_GAP = { ok: true, actual_label: "248.1 ล้านบาท", gap_label: "−25.5 ล้านบาท", contributors: [{ label: "กรุงเทพฯ และปริมณฑล", gap_label: "−5.9 ล้านบาท", share_label: "23.0%" }], share_note: "ช่องว่างกระจายหลายส่วน จึงไม่มีส่วนใดเป็นสาเหตุหลัก" };
  const GAP_ARGS = { range: WEEK, filters: {}, metric: "net_sales_value", split: "region", compare: "prev_period" };
  const ALERTS = { ok: true, summary: "มีความผิดปกติที่เปิดอยู่ 10 รายการ", rows: [{ id: "al_1", window: "14 พ.ย. 2569 – 26 พ.ย. 2569", scope: { agent: "ag_nea_02" } }] };

  function hiddenIn(steps: ToolStep[]): string[] {
    return [...cardPlanOf(steps, new Set(), WHY_TOOLS).hidden].sort();
  }

  test("round 7's week why draws the gap card alone: the week total it repeats and the alerts beside 'no main cause' are left out", () => {
    const steps = [returned("q1", "query_metric", WEEK_ARGS, WEEK_TOTAL), returned("g1", "explain_gap", GAP_ARGS, SPREAD_GAP), returned("a1", "get_alerts", { metric: "net_sales_value", status: "open" }, ALERTS)];
    expect(hiddenIn(steps)).toEqual(["a1", "q1"]);
  });

  test("a gap that names a main cause keeps the alerts, and a total of another window, metric or comparison keeps its card", () => {
    const named = { ...SPREAD_GAP, share_note: null };
    expect(hiddenIn([returned("g1", "explain_gap", GAP_ARGS, named), returned("a1", "get_alerts", {}, ALERTS)])).toEqual([]);
    expect(hiddenIn([returned("q1", "query_metric", WEEK_ARGS, { ...WEEK_TOTAL, query: { ...WEEK_TOTAL.query, range: { from: "2026-11-01", to: "2026-11-26" } } }), returned("g1", "explain_gap", GAP_ARGS, SPREAD_GAP)])).toEqual([]);
    expect(hiddenIn([returned("q1", "query_metric", { ...WEEK_ARGS, metric: "ar_overdue" }, { ...WEEK_TOTAL, query: { ...WEEK_TOTAL.query, metric: "ar_overdue" } }), returned("g1", "explain_gap", GAP_ARGS, SPREAD_GAP)])).toEqual([]);
    expect(hiddenIn([returned("q1", "query_metric", { ...WEEK_ARGS, compare: "prev_year" }, { ...WEEK_TOTAL, query: { ...WEEK_TOTAL.query, compare: "prev_year" } }), returned("g1", "explain_gap", GAP_ARGS, SPREAD_GAP)])).toEqual([]);
  });

  test("round 8's RSM month close draws the gap card alone: the one-row region breakdown, read in the RSM's own region and over the days the data holds, repeats its 87.5% (AI-266)", () => {
    const isanArgs = { compare: "target", dims: ["region"], metric: "net_sales_value", filters: {}, period: "this_month", grain: "month" };
    const isan = { ok: true, rows: [{ region: "ภาคอีสาน", value: 328402399 }], summary: "", headline: { value: "328.4 ล้านบาท", periodLabel: "1 พ.ย. 2569 – 26 พ.ย. 2569", asksMonthEnd: true }, query: { metric: "net_sales_value", dims: ["region"], filters: {}, range: { from: "2026-11-01", to: "2026-11-26" }, grain: "month", compare: "target", limit: null, scopeApplied: { region: ["northeast"] }, labels: { region: ["ภาคอีสาน"] } } };
    const gapArgs = { filters: { region: "northeast" }, range: { to: "2026-11-27", from: "2026-11-01" }, split: "province", metric: "net_sales_value", compare: "target" };
    const gap = { ok: true, period_label: "1 พ.ย. 2569 – 26 พ.ย. 2569", actual_label: "328.4 ล้านบาท", gap_label: "−39.8 ล้านบาท", contributors: [], share_note: null };
    expect(hiddenIn([returned("q1", "query_metric", isanArgs, isan), returned("g1", "explain_gap", gapArgs, gap)])).toEqual(["q1"]);
    const southGap = { ...gapArgs, filters: { region: "south" } };
    expect(hiddenIn([returned("q1", "query_metric", isanArgs, isan), returned("g1", "explain_gap", southGap, gap)])).toEqual([]);
  });

  test("a breakdown of the same window keeps its card, and a gap about one agent keeps that agent's alerts", () => {
    const byRegion = { ...WEEK_TOTAL, rows: [{ region: "ภาคอีสาน", value: 47204061 }, { region: "ภาคเหนือ", value: 32716414 }], query: { ...WEEK_TOTAL.query, dims: ["region"] } };
    expect(hiddenIn([returned("q1", "query_metric", { ...WEEK_ARGS, dims: ["region"] }, byRegion), returned("g1", "explain_gap", GAP_ARGS, SPREAD_GAP)])).toEqual([]);
    const agentGap = { ...GAP_ARGS, filters: { agent: "อีสานรุ่งโรจน์ ค้าส่ง" }, split: "brand" };
    expect(hiddenIn([returned("a1", "get_alerts", { dims: { agent: "อีสานรุ่งโรจน์ ค้าส่ง" } }, ALERTS), returned("g1", "explain_gap", agentGap, SPREAD_GAP)])).toEqual([]);
  });

  test("round 9's CEO month close by region draws one card: the gap card that leads with 96.3% at month end, never the region breakdown above it (AI-293)", () => {
    const closeArgs = { compare: "target", grain: "month", metric: "net_sales_value", filters: {}, period: "this_month", dims: ["region"] };
    const projection = { attainment: "96.3%", attainmentToDate: "83.9%", endShortBy: "68.8 ล้านบาท" };
    const byRegion = { ok: true, rows: [{ region: "ภาคอีสาน", value: 328402399 }, { region: "ภาคเหนือ", value: 200284015 }], summary: "", headline: { value: "1,549.4 ล้านบาท", periodLabel: "1 พ.ย. 2569 – 26 พ.ย. 2569", projection, asksMonthEnd: true }, query: { metric: "net_sales_value", dims: ["region"], filters: {}, range: { from: "2026-11-01", to: "2026-11-26" }, grain: "month", compare: "target", limit: null, scopeApplied: {}, labels: {} } };
    const gapArgs = { split: "region", metric: "net_sales_value", filters: {}, compare: "target", range: { to: "2026-11-26", from: "2026-11-01" } };
    const gap = { ok: true, period_label: "1 พ.ย. 2569 – 26 พ.ย. 2569", actual_label: "1,549.4 ล้านบาท", gap_label: "−50.9 ล้านบาท", contributors: [], share_note: null, projection: { attainment_label: "96.3%" } };
    expect(hiddenIn([returned("q1", "query_metric", closeArgs, byRegion), returned("g1", "explain_gap", gapArgs, gap)])).toEqual(["q1"]);
    const soFar = { ...byRegion, headline: { ...byRegion.headline, asksMonthEnd: undefined } };
    expect(hiddenIn([returned("q1", "query_metric", closeArgs, soFar), returned("g1", "explain_gap", gapArgs, gap)])).toEqual([]);
  });
});
