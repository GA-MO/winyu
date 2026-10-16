import { describe, expect, test } from "bun:test";
import { accessFor } from "@/lib/access/policies";
import type { AccessContext, Alert, AlertRow, MetricQuery, MetricResult, NextAction, QuickAction } from "@/lib/contracts";
import { presentCard } from "@/lib/cards/present";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { AGENTS } from "@/lib/data/entities/agents";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { alerts } from "@/lib/server/agent/collections";
import { winyuTools } from "@/lib/server/agent/tools";
import { openAlertsFor } from "@/lib/server/alerts";
import { runWithAccess } from "@/lib/server/request-context";
import { intentKeyOf, recordAction } from "@/lib/server/threads";

const CEO = "u_thana";
const RSM_NORTHEAST = "u_anucha";
const UBON_AGENT = "ag_nea_05";
const KHON_KAEN_AGENT = "ag_nea_02";
const KHON_KAEN = "pv_khonkaen";
const BANGKOK = "กรุงเทพ";

type Card = Extract<MetricResult, { ok: true }> & { query: MetricQuery; nextActions: NextAction[]; followUps: QuickAction[] };
type AlertsAnswer = { ok: boolean; rows: AlertRow[]; nextActions: NextAction[] };

function accessOf(userId: string): AccessContext {
  const user = findUser(userId);
  if (!user) throw new Error(`no user ${userId}`);
  return accessFor(user);
}

async function call<T>(userId: string, name: string, input: unknown): Promise<T> {
  return runWithAccess(accessOf(userId), () => winyuTools()[name].execute(input) as Promise<T>);
}

function metricQuery(partial: Partial<MetricQuery>): MetricQuery {
  return { metric: "net_sales_volume", dims: ["agent"], filters: {}, range: { from: "2026-09-01", to: "2026-09-22" }, grain: "month", compare: "prev_period", limit: 10, ...partial };
}

async function card(userId: string, partial: Partial<MetricQuery>): Promise<Card> {
  const result = await call<Card>(userId, "query_metric", metricQuery(partial));
  if (!result.ok) throw new Error("query failed");
  return result;
}

function handoffOf(answer: { nextActions: NextAction[] }): { toUserId: string; title: string; ask: string; alertIds: string[] } {
  const handoff = answer.nextActions.find((action) => action.kind === "handoff");
  if (!handoff?.input) throw new Error(`no handoff among ${answer.nextActions.map((action) => action.id).join(",")}`);
  return handoff.input as { toUserId: string; title: string; ask: string; alertIds: string[] };
}

function alertById(id: string): Alert {
  const alert = alerts().get(id);
  if (!alert) throw new Error(`no alert ${id}`);
  return alert;
}

function provinceOfAgent(agentId: string): string | undefined {
  return AGENTS.find((agent) => agent.id === agentId)?.provinceId;
}

describe("a question written in the model's words reaches the same alert and owner as one written in ids", () => {
  test("a region written as its Thai name carries the northeast alert and routes to the region's RSM", async () => {
    const handoff = handoffOf(await card(CEO, { metric: "sell_out_volume", dims: ["province"], filters: { region: ["ภาคอีสาน"] } }));
    expect(handoff.toUserId).toBe(RSM_NORTHEAST);
    expect(handoff.alertIds).toHaveLength(1);
    const alert = alertById(handoff.alertIds[0]);
    expect(alert.metric).toBe("sell_out_volume");
    expect(alert.dims.region).toBe("northeast");
  });

  test("an agent written as its Thai name carries that agent's alert and routes to the RSM of its region", async () => {
    const handoff = handoffOf(await card(CEO, { dims: ["week"], grain: "week", filters: { agent: ["อีสานรุ่งโรจน์"] } }));
    expect(handoff.toUserId).toBe(RSM_NORTHEAST);
    expect(handoff.alertIds.map((id) => alertById(id).dims.agent)).toEqual([KHON_KAEN_AGENT]);
  });

  test("resolve_owner reads an agent written as its Thai name as that agent's region", async () => {
    const name = AGENTS.find((agent) => agent.id === UBON_AGENT)?.nameTh ?? "";
    const owner = await call<{ ok: boolean; data: { userId: string } }>(CEO, "resolve_owner", { metric: "net_sales_volume", dims: { agent: name } });
    expect(owner.data.userId).toBe(RSM_NORTHEAST);
  });
});

describe("the card's scope line names every slice it is narrowed to", () => {
  test("an RSM's card names the region the role added", async () => {
    const answer = await card(RSM_NORTHEAST, {});
    const parts = presentCard({ title: "t", query: answer.query, result: answer });
    expect(parts.meta).toContain(TH.dash.filteredTo("ภาคอีสาน"));
  });

  test("a breakdown pinned to one of its own rows names that row", async () => {
    const answer = await card(CEO, { metric: "ar_overdue", filters: { agent: [UBON_AGENT] }, compare: "none" });
    const parts = presentCard({ title: "t", query: answer.query, result: answer });
    expect(parts.meta).toContain(TH.dash.filteredTo("อุบลศรีสุข เทรดดิ้ง"));
  });
});

describe("one focus names the card's handoff, pin and follow-ups", () => {
  test("an all-region card is not titled after its largest region, and its handoff title and ask name the same subject", async () => {
    const query = metricQuery({ metric: "sell_out_volume", dims: ["region"] });
    recordAction(CEO, "question", intentKeyOf(query.metric, query.dims), "ยอดขายแยกภาค", null);
    recordAction(CEO, "question", intentKeyOf(query.metric, query.dims), "ยอดขายแยกภาค", null);
    const answer = await card(CEO, query);
    const handoff = handoffOf(answer);
    expect(handoff.title).not.toContain(BANGKOK);
    const subject = handoff.title.replace(`${metricLabel(query.metric)} · `, "");
    expect(handoff.ask).toContain(subject);
    const pin = answer.nextActions.find((action) => action.kind === "pin");
    expect((pin?.input as { title: string } | undefined)?.title).toBe(`${metricLabel(query.metric)} · ${TH.next.splitBy(TH.dash.dimUnit.region)}`);
  });

  test("overdue AR by region asks why about the region of the alert in question, not the largest region", async () => {
    const answer = await card(CEO, { metric: "ar_overdue", dims: ["region"], compare: "none" });
    const inQuestion = openAlertsFor(accessOf(CEO)).find((alert) => alert.metric === "ar_overdue");
    if (!inQuestion?.dims.region) throw new Error("no open AR alert");
    const why = answer.followUps.find((action) => action.id === "fu-why");
    const regionName = answer.rows.map((row) => String(row.region)).find((label) => inQuestion.dims.region === "south" ? label === "ภาคใต้" : label === "ภาคกลาง");
    expect(regionName).toBeDefined();
    expect(why?.prompt).toContain(regionName ?? "");
    expect(why?.prompt).not.toContain(BANGKOK);
  });
});

describe("get_alerts narrows to the slice under discussion", () => {
  test("a province slice returns only alerts inside that province, and the card's actions are about the first of them", async () => {
    const all = await call<AlertsAnswer>(RSM_NORTHEAST, "get_alerts", { status: "open", limit: null });
    const outside = all.rows.filter((row) => (row.scope.province ?? provinceOfAgent(row.scope.agent ?? "")) !== KHON_KAEN);
    expect(outside.length).toBeGreaterThan(0);
    const sliced = await call<AlertsAnswer>(RSM_NORTHEAST, "get_alerts", { status: "open", limit: null, dims: { province: "ขอนแก่น" } });
    expect(sliced.rows.length).toBeGreaterThan(0);
    for (const row of sliced.rows) expect(row.scope.province ?? provinceOfAgent(row.scope.agent ?? "")).toBe(KHON_KAEN);
    const verify = sliced.nextActions.find((action) => action.kind === "verify");
    expect(verify?.prompt).toBe(sliced.rows[0].verifySteps[0]);
  });

  test("a metric slice returns only that metric's alerts", async () => {
    const sliced = await call<AlertsAnswer>(RSM_NORTHEAST, "get_alerts", { status: "open", limit: null, metric: "market_share" });
    expect(sliced.rows.length).toBeGreaterThan(0);
    expect(sliced.rows.every((row) => row.metric === "market_share")).toBe(true);
  });
});
