import { describe, expect, test } from "bun:test";
import type { AccessContext, ActionEvent, Dim, MetricQuery, MetricResult } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { runMetric } from "@/lib/data/query";
import { followUpIntent, followUpsFor, learnedKindShare, type FollowUpKind } from "./follow-ups";
import { scoreIntents } from "./recommend";
import { spaceLatinTh } from "@/lib/i18n/format";

const CEO = "u_thana";
const NOW = new Date("2026-09-22T09:00:00.000Z").getTime();

function accessOf(userId: string): AccessContext {
  const user = findUser(userId);
  if (!user) throw new Error(`no user ${userId}`);
  return accessFor(user);
}

function queryOf(metric: MetricQuery["metric"], dims: Dim[], compare: MetricQuery["compare"] = "prev_period"): MetricQuery {
  return { metric, dims, filters: {}, range: { from: "2026-09-01", to: "2026-09-22" }, grain: "week", compare, limit: 10 };
}

function answered(access: AccessContext, query: MetricQuery): Extract<MetricResult, { ok: true }> {
  const result = runMetric(query, access);
  if (!result.ok) throw new Error("query failed");
  return result;
}

function kindsOf(access: AccessContext, query: MetricQuery, taken: string[] = [], learned: Partial<Record<FollowUpKind, number>> = {}): string[] {
  return followUpsFor(access, { query, result: answered(access, query), taken }, learned).map((action) => action.id);
}

function followUpEvent(kind: FollowUpKind, index: number): ActionEvent {
  return { id: `e${index}`, userId: CEO, at: "2026-09-21T09:00:00.000Z", kind: "follow_up", intentKey: followUpIntent(kind), metric: null, dims: [], prompt: `p${index}`, threadId: null };
}

describe("followUpsFor", () => {
  test("attainment by region asks why the weakest region, then opens it by agent, never compares a target with last year", () => {
    const access = accessOf(CEO);
    const query = queryOf("target_attainment", ["region"], "none");
    const actions = followUpsFor(access, { query, result: answered(access, query), taken: [] });
    const ids = actions.map((action) => action.id);
    expect(ids).toContain("fu-why");
    expect(ids).toContain("fu-drill_down");
    expect(ids).not.toContain("fu-compare_year");
    expect(actions.find((action) => action.id === "fu-drill_down")?.prompt).toContain("เอเย่นต์");
  });

  test("a single number is split and trended, with nothing to ask why about", () => {
    const ids = kindsOf(accessOf(CEO), queryOf("gross_margin", []));
    expect(ids).toContain("fu-split");
    expect(ids).not.toContain("fu-why");
    expect(ids).not.toContain("fu-drill_down");
  });

  test("a weekly series never offers its own trend", () => {
    expect(kindsOf(accessOf(CEO), queryOf("net_sales_volume", ["week"]))).not.toContain("fu-trend");
  });

  test("a result already compared with last year does not offer it again", () => {
    expect(kindsOf(accessOf(CEO), queryOf("gross_margin", [], "prev_year"))).not.toContain("fu-compare_year");
  });

  test("a question the card already offers is left out, a split moves on to the next dimension", () => {
    const access = accessOf(CEO);
    const query = queryOf("gross_margin", []);
    const first = followUpsFor(access, { query, result: answered(access, query), taken: [] })[0];
    if (!first) throw new Error("no follow-up");
    const next = followUpsFor(access, { query, result: answered(access, query), taken: [first.prompt] });
    expect(next.map((action) => action.prompt)).not.toContain(first.prompt);
    expect(next.find((action) => action.id === "fu-split")?.label).not.toBe(first.label);
  });

  test("a kind the user keeps pressing climbs the list", () => {
    const access = accessOf(CEO);
    const query = queryOf("gross_margin", []);
    const plain = kindsOf(access, query);
    const last = plain[plain.length - 1] as string;
    const kind = last.replace("fu-", "") as FollowUpKind;
    expect(kindsOf(access, query, [], { [kind]: 1 })[0]).toBe(last);
  });

  test("forecast follow-ups exist only for metrics the engine forecasts", () => {
    expect(kindsOf(accessOf(CEO), queryOf("gross_margin", []))).not.toContain("fu-forecast");
    const access = accessOf(CEO);
    const query = queryOf("net_sales_volume", ["brand"]);
    const all = followUpsFor(access, { query, result: answered(access, query), taken: [] }, { forecast: 1 });
    expect(all.find((action) => action.id === "fu-forecast")?.prompt).toContain("8 สัปดาห์");
  });

  test("never offers more than three", () => {
    expect(kindsOf(accessOf(CEO), queryOf("net_sales_volume", ["region"])).length).toBeLessThanOrEqual(3);
  });
});

describe("learning from follow-up presses", () => {
  test("shares count only this user's follow-up presses", () => {
    const events = [followUpEvent("why", 1), followUpEvent("why", 2), followUpEvent("forecast", 3)];
    const share = learnedKindShare(events, CEO, NOW);
    expect(share.why).toBeCloseTo(2 / 3);
    expect(share.forecast).toBeCloseTo(1 / 3);
    expect(learnedKindShare(events, "u_other", NOW)).toEqual({});
  });

  test("follow-up presses never become learned quick-action chips", () => {
    const events = [1, 2, 3, 4].map((index) => followUpEvent("why", index));
    expect(scoreIntents(accessOf(CEO), NOW, events)).toEqual([]);
  });
});

describe("spaceLatinTh", () => {
  test("sets English terms apart from Thai", () => {
    expect(spaceLatinTh("ดูSKUในDC สงขลา")).toBe("ดู SKU ใน DC สงขลา");
    expect(spaceLatinTh("ปริมาณขายเข้า (Sell-in)ของภาคอีสาน")).toBe("ปริมาณขายเข้า (Sell-in) ของภาคอีสาน");
  });
});
