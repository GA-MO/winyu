import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { liveAccessFor } from "@/lib/access/enforce";
import { metricQueryInputSchema } from "@/lib/contracts";
import { ownAgentsFilter } from "@/lib/data/entities/agents";
import { findUser } from "@/lib/data/entities/users";
import type { ShareTarget } from "@/lib/share/card";
import { layouts } from "@/lib/server/agent/collections";
import { winyuTools } from "@/lib/server/agent/tools";
import { runWithAccess, runWithTurn } from "@/lib/server/request-context";
import { pinHero } from "@/lib/server/tools/pin-widget";
import { approvedCallId } from "@/scripts/approved-call";
import { screenWith } from "@/scripts/screen-cards";

const USER = "u_anucha";
const REP = "u_krit";
const THIS_MONTH = { metric: "net_sales_value", dims: [], filters: { region: ["northeast"] }, grain: "month", compare: "target", limit: null, period: "this_month", range: null };
const AGENTS_AGAINST_TARGET = metricQueryInputSchema.parse({ metric: "net_sales_value", dims: ["agent"], filters: {}, grain: "month", compare: "target", limit: null, period: "this_month", range: null });

function accessOf(userId: string) {
  const user = findUser(userId);
  if (!user) throw new Error(`no ${userId}`);
  return liveAccessFor(user);
}

describe("pin_widget", () => {
  test("pins a query asked by period, as query_metric takes it, with the period's dates", async () => {
    const result = (await runWithAccess(accessOf(USER), () => winyuTools().pin_widget.execute({ title: "ยอดอีสานเดือนนี้", kind: "metric", query: THIS_MONTH }, { toolCallId: approvedCallId(USER, "pin_widget") }))) as { ok: boolean; data?: { widgetId: string } };
    expect(result).toMatchObject({ ok: true });
    const widget = layouts().get(USER)?.widgets.find((entry) => entry.id === result.data?.widgetId);
    expect(widget?.query.range).toEqual({ from: expect.stringMatching(/^\d{4}-\d{2}-01$/), to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  });

  test("a rep's pin of the card about his own agents keeps his agents, as the card showed them, even when the pin request does not say ผม (AI-183)", async () => {
    const card: ShareTarget = { card: { kind: "tool", reads: [{ tool: "query_metric", input: { metric: "net_sales_value", period: "this_month", dims: ["agent"], compare: "target", filters: {}, grain: "month" } }] }, question: "เอเย่นต์ของผมเดือนนี้ถึงเป้าแค่ไหน" };
    const turn = { turnId: randomUUID(), threadId: null, question: "ปักการ์ดเอเย่นต์เทียบเป้าอันแรกไว้ที่ Dashboard", queries: [], screenCards: async () => screenWith([card]) };
    const pin = () => winyuTools().pin_widget.execute({ title: "มูลค่าขายเข้ารายเอเย่นต์เทียบเป้า", kind: "bar", query: AGENTS_AGAINST_TARGET }, { toolCallId: approvedCallId(REP, "pin_widget") });
    const result = (await runWithAccess(accessOf(REP), () => runWithTurn(turn, pin))) as { ok: boolean; data?: { widgetId: string } };
    expect(result).toMatchObject({ ok: true });
    const widget = layouts().get(REP)?.widgets.find((entry) => entry.id === result.data?.widgetId);
    const own = ownAgentsFilter(REP).agent ?? [];
    expect(own.length).toBeGreaterThan(0);
    expect([...(widget?.query.filters.agent ?? [])].sort()).toEqual([...own].sort());
  });

  test("the pin approval's figure is the one the widget will show: the rep's own agents for his own-book question, the region for a whole-region one (AI-184)", async () => {
    const own = await pinHero("เอเย่นต์ของผม", AGENTS_AGAINST_TARGET, accessOf(REP), "เอเย่นต์ของผมเดือนนี้ถึงเป้าแค่ไหน");
    const region = await pinHero("ทั้งภาค", AGENTS_AGAINST_TARGET, accessOf(REP), "ทั้งภาคเดือนนี้ถึงเป้าแค่ไหน");
    expect(own).toMatch(/\d/);
    expect(region).toMatch(/\d/);
    expect(own).not.toBe(region);
  });
});
