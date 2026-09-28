import { describe, expect, test } from "bun:test";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import type { DraftStory, MetricQuery } from "@/lib/contracts";
import { runMetric } from "./metrics";
import { callsWithAnomalies, cardNumbersOf, evidenceIndexOf, gapQueryOf, openAnomalies, repeatedIn, reviewDrafts, roleHoldersNamedIn, storiesFrom, evidenceQueryOf, withoutPinnedDims, type ToolCall } from "./investigate";

function accessOf(userId: string) {
  const user = findUser(userId);
  if (!user) throw new Error(`missing ${userId}`);
  return accessFor(user);
}

describe("an investigation starts from anomalies", () => {
  test("the CEO's open anomalies are read through get_alerts before any story is written", async () => {
    const call = await openAnomalies(accessOf("u_thana"));
    const output = call.output as { ok: boolean; rows: { severity: string; metric: string; scopeLabel: string }[] };
    expect(call.tool).toBe("get_alerts");
    expect(call.input).toEqual({ status: "open", limit: 10 });
    expect(output.ok).toBe(true);
    expect(output.rows.length).toBeGreaterThan(0);
    expect(output.rows.length).toBeLessThanOrEqual(10);
    expect(output.rows.some((row) => row.severity === "P1" && row.scopeLabel.length > 0)).toBe(true);
  });

  test("a drill that never called get_alerts still keeps the anomaly read on the call list", () => {
    const anomalies = { tool: "get_alerts", input: { status: "open", limit: 10 }, output: { rows: [{ metric: "days_of_cover" }] } };
    const drilled = [{ tool: "explain_gap", input: {}, output: {} }];
    expect(callsWithAnomalies(anomalies, drilled).map((call) => call.tool)).toEqual(["get_alerts", "explain_gap"]);
    expect(callsWithAnomalies(anomalies, [anomalies, ...drilled])).toHaveLength(2);
  });
});

describe("a story is checked before it is kept", () => {
  const DIRECTOR = accessOf("u_prasit");
  const QUERY: MetricQuery = { metric: "net_sales_volume", dims: ["agent"], filters: { region: ["northeast"] }, range: { from: "2026-09-01", to: "2026-09-22" }, grain: "day", compare: "target", limit: null };

  async function callsFor(): Promise<ToolCall[]> {
    const result = await runMetric(QUERY, DIRECTOR);
    if (!result.ok) throw new Error(result.error);
    const anomalies = { tool: "get_alerts", input: { status: "open", limit: 10 }, output: { ok: true, rows: [] } };
    return [anomalies, { tool: "query_metric", input: QUERY, output: { ...result, query: QUERY, nextActions: [] } }];
  }

  function draftOf(partial: Partial<DraftStory>): DraftStory {
    return { kind: "urgent", finding: "อีสานจะปิดเดือนต่ำกว่าเป้า สองเอเย่นต์ใหญ่แทบหยุดสั่ง", scope: "ภาคอีสาน", subject: { metric: "net_sales_volume", region: "northeast" }, evidence: { call: 1, title: "ยอดขายเข้าอีสานเทียบเป้า แยกตามเอเย่นต์" }, ruledOut: [], action: "ถามผู้จัดการขายภาคอีสานว่าสองเอเย่นต์ติดวงเงินหรือไม่", ...partial };
  }

  test("a finding that says what the card means passes every check and keeps its query, ranked shortfall first, as evidence", async () => {
    const calls = await callsFor();
    const evidence = await evidenceIndexOf(calls, DIRECTOR);
    const [reviewed] = reviewDrafts([draftOf({})], calls, evidence);
    expect(reviewed).toMatchObject({ ungrounded: [], names: [], problems: [] });
    expect(storiesFrom("u_prasit", [reviewed], calls, evidence).stories[0].evidence).toEqual({ title: "ยอดขายเข้าอีสานเทียบเป้า แยกตามเอเย่นต์", query: { ...QUERY, sort: "delta_asc" } });
  });

  test("a finding that repeats its card's headline or month-end number asks for a rewrite", async () => {
    const calls = await callsFor();
    const evidence = await evidenceIndexOf(calls, DIRECTOR);
    const answer = calls[1].output as Parameters<typeof cardNumbersOf>[0];
    const [shown] = cardNumbersOf(answer, "t");
    const [reviewed] = reviewDrafts([draftOf({ finding: `อีสานขายได้ ${shown} ต่ำกว่าเป้า` })], calls, evidence);
    expect(reviewed.problems).toContain(`finding repeats the card's number ${shown}`);
    expect(repeatedIn(draftOf({ finding: `สิ้นเดือนน่าจะได้ ${answer.headline.projection?.attainment} ของเป้า` }), evidence)).toHaveLength(1);
  });

  test("evidence that is not a successful query_metric or explain_gap call asks for a rewrite and is never drawn", async () => {
    const calls = await callsFor();
    const evidence = await evidenceIndexOf(calls, DIRECTOR);
    const draft = draftOf({ evidence: { call: 0, title: "ความผิดปกติ" } });
    const [reviewed] = reviewDrafts([draft], calls, evidence);
    expect(reviewed.problems).toContain("evidence.call 0 is not a successful query_metric or explain_gap call");
    expect(storiesFrom("u_prasit", [reviewed], calls, evidence).stories[0].evidence).toBeNull();
  });

  test("an explain_gap call is drawn as the same split against the same comparison, biggest shortfall first", async () => {
    const input = { metric: "net_sales_volume", split: "agent", filters: { region: ["northeast"] }, range: { from: "2026-09-01", to: "2026-09-22" }, compare: "target" };
    const gap = { tool: "explain_gap", input, output: { ok: true } };
    const evidence = await evidenceIndexOf([gap, { tool: "explain_gap", input, output: { ok: false } }], DIRECTOR);
    expect(gapQueryOf(input)).toEqual({ metric: "net_sales_volume", dims: ["agent"], filters: { region: ["northeast"] }, range: input.range, grain: "day", compare: "target", limit: null, sort: "delta_asc", where: null });
    expect(evidence.get(0)?.query.dims).toEqual(["agent"]);
    expect(evidence.get(0)?.headline.projection?.attainment).toMatch(/%$/);
    expect(evidence.has(1)).toBe(false);
  });

  test("a card split by a dimension its filter already pins to one value drops that dimension, so rows are not all the same DC", async () => {
    const pinned: MetricQuery = { metric: "days_of_cover", dims: ["dc", "sku"], filters: { dc: ["dc_lamphun"] }, range: { from: "2026-09-16", to: "2026-09-22" }, grain: "day", compare: "none", limit: 10, sort: "value_asc" };
    expect(withoutPinnedDims(pinned).dims).toEqual(["sku"]);
    expect(withoutPinnedDims({ ...pinned, filters: { dc: ["dc_lamphun", "dc_chiangmai"] } }).dims).toEqual(["dc", "sku"]);
    const result = await runMetric(pinned, DIRECTOR);
    if (!result.ok) throw new Error(result.error);
    const evidence = await evidenceIndexOf([{ tool: "query_metric", input: pinned, output: { ...result, query: pinned, nextActions: [] } }], DIRECTOR);
    expect(evidence.get(0)?.query.dims).toEqual(["sku"]);
  });

  test("a card proving a change ranks by the change, the bad side first, unless the query already ranks by change", () => {
    const base: MetricQuery = { metric: "trade_spend", dims: ["business_unit"], filters: {}, range: { from: "2026-09-01", to: "2026-09-22" }, grain: "month", compare: "prev_period", limit: 10, sort: "value_desc" };
    expect(evidenceQueryOf(base).sort).toBe("delta_desc");
    expect(evidenceQueryOf({ ...base, metric: "net_sales_volume" }).sort).toBe("delta_asc");
    expect(evidenceQueryOf({ ...base, sort: "delta_asc" }).sort).toBe("delta_asc");
    expect(evidenceQueryOf({ ...base, compare: "none" })).toEqual({ ...base, compare: "none" });
    expect(evidenceQueryOf({ ...base, dims: ["week"] }).sort).toBe("value_desc");
  });

  test("an explain_gap card leads with the parts that made the gap, whichever way it runs", () => {
    const input = { metric: "ar_overdue", split: "agent", filters: {}, range: { from: "2026-09-01", to: "2026-09-22" }, compare: "prev_year" };
    expect(gapQueryOf(input, "−278,490 ลิตร")?.sort).toBe("delta_asc");
    expect(gapQueryOf(input, "+7.8 ล้านบาท")?.sort).toBe("delta_desc");
  });

  test("a role holder's name blocks the story, the role does not, and a short name counts only after คุณ", () => {
    expect(roleHoldersNamedIn(draftOf({ action: "ถามคุณอนุชาว่าสองเอเย่นต์ติดวงเงินหรือไม่" }))).toEqual(["คุณอนุชา พรหมศรี"]);
    expect(roleHoldersNamedIn(draftOf({ action: "ให้อนุชาตามเอเย่นต์" }))).toEqual(["คุณอนุชา พรหมศรี"]);
    expect(roleHoldersNamedIn(draftOf({ finding: "ไฟฟ้าดับที่โรงงาน ต้นทุนพุ่ง" }))).toEqual([]);
    expect(roleHoldersNamedIn(draftOf({ action: "แจ้งคุณฟ้าเรื่องแคมเปญ" }))).toEqual(["คุณฟ้า เลิศปัญญา"]);
  });

  test("a blocked story is dropped, and a ruled-out claim stands only on a data tool this run called", async () => {
    const calls = await callsFor();
    const ruledOut = [
      { text: "สต๊อก DC พอ", source: "query_metric" },
      { text: "เคยติดวงเงินมาก่อน", source: "recall_memory" },
      { text: "ไม่ใช่เรื่องไซต์", source: "get_site" },
    ];
    const evidence = await evidenceIndexOf(calls, DIRECTOR);
    const reviewed = reviewDrafts([draftOf({ ruledOut }), draftOf({ action: "ถามคุณอนุชา" }), draftOf({ finding: "ขาดเป้า 123,456,789 ลิตร" })], calls, evidence);
    const { stories, dropped } = storiesFrom("u_prasit", reviewed, calls, evidence);
    expect(stories).toHaveLength(1);
    expect(stories[0].ruledOut).toEqual([{ text: "สต๊อก DC พอ", source: "query_metric" }]);
    expect(dropped.map((entry) => [...entry.names, ...entry.ungrounded])).toEqual([["คุณอนุชา พรหมศรี"], ["123,456,789"]]);
  });
});
