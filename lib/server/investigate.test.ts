import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { ScriptedModel } from "@/scripts/scripted-model";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import type { AlertRow, DraftStory, MetricQuery } from "@/lib/contracts";
import { runMetric } from "./metrics";
import { callsWithAnomalies, cardNumbersOf, evidenceIndexOf, gapQueryOf, investigate, investigateSystemFor, openAnomalies, repeatedIn, reviewDrafts, roleHoldersNamedIn, storiesFrom, evidenceQueryOf, uncoveredFor, whoOf, withoutPinnedDims, type ToolCall } from "./investigate";
import { agentsOwnedBy } from "@/lib/data/entities/agents";
import { DATA_AS_OF, dataDay, monthStart } from "@/lib/data/dates";

setDefaultTimeout(30_000);

function accessOf(userId: string) {
  const user = findUser(userId);
  if (!user) throw new Error(`missing ${userId}`);
  return accessFor(user);
}

describe("the investigation only asks for explanations the person can read", () => {
  test("a regional sales manager is not told to test campaigns or other regions", () => {
    const system = investigateSystemFor(accessOf("u_anucha"));
    expect(system).not.toMatch(/campaign/i);
    expect(system).not.toContain("other regions");
    expect(system).toContain("stock/cover");
  });

  test("a rep's investigation is told which agents are his, so his stories sit on his own book (AI-158)", () => {
    const krit = findUser("u_krit");
    const anucha = findUser("u_anucha");
    if (!krit || !anucha) throw new Error("missing users");
    const who = whoOf(krit, accessOf("u_krit"));
    for (const agent of agentsOwnedBy("u_krit")) expect(who).toContain(agent.nameTh);
    expect(whoOf(anucha, accessOf("u_anucha"))).not.toContain("Owns agents");
  });

  test("the CEO is told to test every explanation", () => {
    const system = investigateSystemFor(accessOf("u_thana"));
    for (const check of ["season vs prior year", "stock/cover", "campaigns", "other regions", "sell-in vs sell-out"]) expect(system).toContain(check);
  });
});

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
  const QUERY: MetricQuery = { metric: "net_sales_volume", dims: ["agent"], filters: { region: ["northeast"] }, range: { from: monthStart(DATA_AS_OF), to: DATA_AS_OF }, grain: "day", compare: "target", limit: null };

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
    expect(storiesFrom("u_prasit", [reviewed], calls, evidence, []).stories[0].evidence).toEqual({ title: "ยอดขายเข้าอีสานเทียบเป้า แยกตามเอเย่นต์", query: { ...QUERY, metric: "net_sales_value", sort: "delta_asc" } });
  });

  test("a sell-in card is drawn in baht, the measure chat answers in, for whoever sees baht; a planner who sees only litres keeps litres (AI-136)", async () => {
    const calls = await callsFor();
    expect((await evidenceIndexOf(calls, DIRECTOR)).get(1)?.query.metric).toBe("net_sales_value");
    const input = { metric: "net_sales_volume", split: "agent", filters: { region: ["northeast"] }, range: { from: monthStart(DATA_AS_OF), to: DATA_AS_OF }, compare: "target" };
    const gap = await evidenceIndexOf([{ tool: "explain_gap", input, output: { ok: true } }], accessOf("u_thana"));
    expect(gap.get(0)?.query.metric).toBe("net_sales_value");
    expect(gap.get(0)?.headline.projection?.monthTarget).toContain("บาท");
    const planner = await evidenceIndexOf([{ tool: "explain_gap", input, output: { ok: true } }], accessOf("u_wee"));
    expect(planner.get(0)?.query.metric).toBe("net_sales_volume");
  });

  test("a finding that quotes litres under a card drawn in baht asks for a rewrite", async () => {
    const calls = await callsFor();
    const evidence = await evidenceIndexOf(calls, DIRECTOR);
    const [litres] = reviewDrafts([draftOf({ finding: "อีสานยังขาดอีกราว 1.29 ล้านลิตร สองเอเย่นต์ใหญ่แทบหยุดสั่ง" })], calls, evidence);
    expect(litres.problems).toContain("finding quotes litres while its card is in baht");
  });

  test("a finding that repeats its card's headline or month-end number asks for a rewrite", async () => {
    const calls = await callsFor();
    const evidence = await evidenceIndexOf(calls, DIRECTOR);
    const answer = evidence.get(1);
    if (!answer) throw new Error("no evidence card");
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
    expect(storiesFrom("u_prasit", [reviewed], calls, evidence, []).stories[0].evidence).toBeNull();
  });

  test("an explain_gap call is drawn as the same split against the same comparison, biggest shortfall first", async () => {
    const input = { metric: "net_sales_volume", split: "agent", filters: { region: ["northeast"] }, range: { from: monthStart(DATA_AS_OF), to: DATA_AS_OF }, compare: "target" };
    const gap = { tool: "explain_gap", input, output: { ok: true } };
    const evidence = await evidenceIndexOf([gap, { tool: "explain_gap", input, output: { ok: false } }], DIRECTOR);
    expect(gapQueryOf(input)).toEqual({ metric: "net_sales_volume", dims: ["agent"], filters: { region: ["northeast"] }, range: input.range, grain: "day", compare: "target", limit: null, sort: "delta_asc", where: null });
    expect(evidence.get(0)?.query.dims).toEqual(["agent"]);
    expect(evidence.get(0)?.headline.projection?.attainment).toMatch(/%$/);
    expect(evidence.has(1)).toBe(false);
  });

  test("a card split by a dimension its filter already pins to one value drops that dimension, so rows are not all the same DC", async () => {
    const pinned: MetricQuery = { metric: "days_of_cover", dims: ["dc", "sku"], filters: { dc: ["dc_lamphun"] }, range: { from: dataDay(-6), to: DATA_AS_OF }, grain: "day", compare: "none", limit: 10, sort: "value_asc" };
    expect(withoutPinnedDims(pinned).dims).toEqual(["sku"]);
    expect(withoutPinnedDims({ ...pinned, filters: { dc: ["dc_lamphun", "dc_chiangmai"] } }).dims).toEqual(["dc", "sku"]);
    const result = await runMetric(pinned, DIRECTOR);
    if (!result.ok) throw new Error(result.error);
    const evidence = await evidenceIndexOf([{ tool: "query_metric", input: pinned, output: { ...result, query: pinned, nextActions: [] } }], DIRECTOR);
    expect(evidence.get(0)?.query.dims).toEqual(["sku"]);
  });

  test("a card proving a change ranks by the change, the bad side first, unless the query already ranks by change", () => {
    const base: MetricQuery = { metric: "trade_spend", dims: ["business_unit"], filters: {}, range: { from: monthStart(DATA_AS_OF), to: DATA_AS_OF }, grain: "month", compare: "prev_period", limit: 10, sort: "value_desc" };
    expect(evidenceQueryOf(base).sort).toBe("delta_desc");
    expect(evidenceQueryOf({ ...base, metric: "net_sales_volume" }).sort).toBe("delta_asc");
    expect(evidenceQueryOf({ ...base, sort: "delta_asc" }).sort).toBe("delta_asc");
    expect(evidenceQueryOf({ ...base, compare: "none" })).toEqual({ ...base, compare: "none" });
    expect(evidenceQueryOf({ ...base, dims: ["week"] }).sort).toBe("value_desc");
  });

  test("an explain_gap card leads with the parts that made the gap, whichever way it runs", () => {
    const input = { metric: "ar_overdue", split: "agent", filters: {}, range: { from: monthStart(DATA_AS_OF), to: DATA_AS_OF }, compare: "prev_year" };
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
    const { stories, dropped } = storiesFrom("u_prasit", reviewed, calls, evidence, []);
    expect(stories).toHaveLength(1);
    expect(stories[0].ruledOut).toEqual([{ text: "สต๊อก DC พอ", source: "query_metric" }]);
    expect(dropped.map((entry) => [...entry.names, ...entry.ungrounded])).toEqual([["คุณอนุชา พรหมศรี"], ["123,456,789"]]);
  });
});

describe("every P1 matter of the person gets a story (AI-166)", () => {
  const CEO = "u_thana";
  const NOTES = "Four P1 matters: Lamphun cover, South AR, the Isan sell-in drop at two agents, Korat market share.";
  const LAMPHUN: DraftStory = { kind: "urgent", finding: "สต๊อกเพอร์ร่าที่ศูนย์ลำพูนจะหมดก่อนรอบเติม", scope: "DC ลำพูน · เพอร์ร่า 600 มล.", subject: { metric: "days_of_cover", region: "north" }, evidence: null, ruledOut: [], action: "ถามนักวางแผนซัพพลายว่าจะโอนของเข้าลำพูนเมื่อไร" };
  const SOUTH_AR: DraftStory = { kind: "urgent", finding: "หนี้ค้างชำระภาคใต้สูงขึ้นมาก กระจุกอยู่ไม่กี่เอเย่นต์", scope: "ภาคใต้", subject: { metric: "ar_overdue", region: "south" }, evidence: null, ruledOut: [], action: "ถามฝ่ายสินเชื่อว่าจะเร่งเก็บหนี้อย่างไร" };
  const KORAT_SHARE: DraftStory = { kind: "watch", finding: "ส่วนแบ่งตลาดเบียร์ที่นครราชสีมาลดลง คู่แข่งรุกหนัก", scope: "นครราชสีมา", subject: { metric: "market_share", region: "northeast" }, evidence: null, ruledOut: [], action: null };
  const ISAN: DraftStory = { kind: "urgent", finding: "ยอดขายเข้าอีสานจะปิดเดือนต่ำกว่าเป้า สองเอเย่นต์แทบหยุดสั่ง", scope: "ภาคอีสาน", subject: { metric: "net_sales_value", region: "northeast" }, evidence: null, ruledOut: [], action: "ถามผู้จัดการขายภาคอีสานว่าสองเอเย่นต์ติดอะไร" };

  function writes(...replies: DraftStory[][]) {
    const scripted = new ScriptedModel();
    scripted.script([{ text: NOTES }, ...replies.map((stories) => ({ text: JSON.stringify({ stories }) }))]);
    return scripted;
  }

  function mentions(scripted: ScriptedModel, call: number, id: string): number {
    return JSON.stringify(scripted.model.doGenerateCalls[call]?.prompt ?? null).split(id).length - 1;
  }

  test("a writer that leaves out the Isan sell-in story is asked once to write it, naming only the uncovered anomalies, and the story leads the drawer", async () => {
    const scripted = writes([LAMPHUN, SOUTH_AR, KORAT_SHARE], [ISAN]);
    const run = await investigate(CEO, scripted.model, "scripted");
    expect(run.investigation.stories.map((story) => story.scope)).toEqual(["ภาคอีสาน", LAMPHUN.scope, SOUTH_AR.scope, KORAT_SHARE.scope]);
    expect(scripted.calls).toBe(3);
    for (const uncovered of ["ag_nea_02", "ag_nea_05"]) expect(mentions(scripted, 2, uncovered)).toBe(mentions(scripted, 1, uncovered) + 1);
    for (const covered of ["dc_lamphun", "pv_nakhonratchasima"]) expect(mentions(scripted, 2, covered)).toBe(mentions(scripted, 1, covered));
  });

  test("a writer that still leaves it out keeps what it wrote, invents nothing and records the gap", async () => {
    const scripted = writes([LAMPHUN, SOUTH_AR, KORAT_SHARE], []);
    const run = await investigate(CEO, scripted.model, "scripted");
    expect(run.investigation.stories.map((story) => story.scope)).toEqual([LAMPHUN.scope, SOUTH_AR.scope, KORAT_SHARE.scope]);
    expect(scripted.calls).toBe(3);
    expect(run.uncovered.map((anomaly) => anomaly.scope.agent)).toEqual(["ag_nea_02", "ag_nea_05"]);
  });

  function anomaly(severity: AlertRow["severity"], metric: AlertRow["metric"], scope: AlertRow["scope"]): AlertRow {
    return { id: `${metric}-${JSON.stringify(scope)}`, severity, severityLabel: severity, metric, metricLabel: metric, scope, scopeLabel: "", window: "", observedLabel: "", expectedLabel: "", gapLabel: null, yearOverYear: false, direction: "down", hypothesis: "", ownerUserId: "u_anucha" };
  }

  test("a sell-in story told in baht or against target explains the litres alerts of its region; another region or another measure does not", () => {
    const isan = [anomaly("P1", "net_sales_volume", { agent: "ag_nea_02", region: "northeast" }), anomaly("P1", "net_sales_volume", { agent: "ag_nea_05", region: "northeast" })];
    expect(uncoveredFor("u_anucha", [{ metric: "net_sales_value", region: "northeast" }], isan)).toEqual([]);
    expect(uncoveredFor("u_anucha", [{ metric: "target_attainment", region: null }], isan)).toEqual([]);
    expect(uncoveredFor("u_anucha", [{ metric: "net_sales_value", region: "north" }], isan)).toEqual(isan);
    expect(uncoveredFor("u_anucha", [{ metric: "sell_out_volume", region: "northeast" }], isan)).toEqual(isan);
    expect(uncoveredFor("u_anucha", [], [anomaly("P2", "net_sales_volume", { region: "northeast" })])).toEqual([]);
  });

  test("a rep owes a story only for P1 anomalies on his own agents; another owner's agent stays context (AI-158)", () => {
    const owned = agentsOwnedBy("u_krit").map((agent) => agent.id);
    const mine = anomaly("P1", "net_sales_volume", { agent: owned[0], region: "northeast" });
    const theirs = anomaly("P1", "net_sales_volume", { agent: "ag_nea_07", region: "northeast" });
    expect(owned).not.toContain("ag_nea_07");
    expect(uncoveredFor("u_krit", [], [mine, theirs])).toEqual([mine]);
    expect(uncoveredFor("u_anucha", [], [mine, theirs])).toEqual([mine, theirs]);
  });

  test("four stories that cover every P1 matter are kept as written, with no rewrite", async () => {
    const scripted = writes([LAMPHUN, ISAN, SOUTH_AR, KORAT_SHARE]);
    const run = await investigate(CEO, scripted.model, "scripted");
    expect(run.investigation.stories).toHaveLength(4);
    expect(scripted.calls).toBe(2);
    expect(run.uncovered).toEqual([]);
  });
});
