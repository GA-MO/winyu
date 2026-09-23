import { describe, expect, test } from "bun:test";
import type { ActionEvent, Alert, MetricQuery, MetricResult, MetricRow, WidgetSpec } from "@/lib/contracts";
import { STALE_DAYS, attentionOf, staleWidgets } from "./attention";

const NOW = Date.parse("2026-10-20T09:00:00.000Z");
const DAY_MS = 86_400_000;

function query(overrides: Partial<MetricQuery> = {}): MetricQuery {
  return { metric: "net_sales_volume", dims: [], filters: {}, range: { from: "2026-09-01", to: "2026-09-22" }, grain: "month", compare: "prev_period", limit: null, ...overrides };
}

function widget(id: string, overrides: Partial<WidgetSpec> = {}): WidgetSpec {
  return { id, userId: "u_x", title: id, kind: "metric", query: query(), pinned: true, position: 0, source: "role_template", reason: null, createdAt: "2026-09-01T00:00:00.000Z", version: 1, ...overrides };
}

function result(deltaPercent: number | null, rows: MetricRow[] = []): MetricResult {
  return {
    ok: true,
    rows,
    summary: "",
    headline: { aggregate: "sum", value: "1,000 ลัง", periodLabel: "ก.ย.", rowCount: rows.length, deltaPercent, compareLabel: "เทียบช่วงก่อนหน้า", top: [] },
    provenance: { metric: "net_sales_volume", certified: true, sourceSystem: "SAP", asOf: "2026-09-22", rowCount: rows.length, filtersApplied: {}, scopeApplied: {}, masked: [], trust: "verified" },
  } as MetricResult;
}

const ALERT = { id: "a1", metric: "net_sales_volume" } as Alert;

describe("which pinned cards have something to say", () => {
  test("a small move with no alert is steady", () => {
    expect(attentionOf({ widget: widget("w"), result: result(2.1), alerts: [] }).level).toBe("steady");
  });

  test("a headline move of 5% or more is news, and says by how much", () => {
    const attention = attentionOf({ widget: widget("w"), result: result(-8.2), alerts: [] });
    expect(attention.level).toBe("moved");
    expect(attention.reason).toContain("-8.2%");
  });

  test("an open alert on the card's metric makes it news", () => {
    expect(attentionOf({ widget: widget("w"), result: result(0), alerts: [ALERT] }).level).toBe("moved");
    expect(attentionOf({ widget: widget("w", { query: query({ metric: "gross_margin" }) }), result: result(0), alerts: [ALERT] }).level).toBe("steady");
  });

  test("a level under its floor is news even when it did not move", () => {
    const attainment = widget("w", { query: query({ metric: "target_attainment", compare: "none" }) });
    expect(attentionOf({ widget: attainment, result: result(null, [{ value: 73.2 }]), alerts: [] }).level).toBe("moved");
    expect(attentionOf({ widget: attainment, result: result(null, [{ value: 101 }]), alerts: [] }).level).toBe("steady");
  });

  test("an alert list with nothing open is steady", () => {
    expect(attentionOf({ widget: widget("w", { kind: "alert_list" }), result: result(null), alerts: [] }).level).toBe("steady");
  });

  test("one row that fell hard in a breakdown is news, a good jump is not", () => {
    const byAgent = widget("w", { kind: "bar", query: query({ dims: ["agent"] }) });
    const fell = attentionOf({ widget: byAgent, result: result(1, [{ agent: "ส.รุ่งเรือง", value: 20, delta_pct: -80 }]), alerts: [] });
    expect(fell.level).toBe("moved");
    expect(fell.reason).toContain("ส.รุ่งเรือง");
    expect(attentionOf({ widget: byAgent, result: result(1, [{ agent: "ส.รุ่งเรือง", value: 180, delta_pct: 80 }]), alerts: [] }).level).toBe("steady");
  });
});

function view(widgetId: string, daysAgo: number): ActionEvent {
  return { id: `${widgetId}_${daysAgo}`, userId: "u_x", at: new Date(NOW - daysAgo * DAY_MS).toISOString(), kind: "widget_view", intentKey: `widget:${widgetId}`, metric: null, dims: [], prompt: null, threadId: null };
}

describe("cards the user stopped looking at", () => {
  const widgets = [widget("seen"), widget("ignored"), widget("new", { createdAt: new Date(NOW - 3 * DAY_MS).toISOString() }), widget("tray", { pinned: false })];

  test("nothing is stale before there are two weeks of viewing to judge by", () => {
    expect(staleWidgets(widgets, [view("seen", 3)], "u_x", NOW)).toEqual([]);
  });

  test("a pinned card with no view in two weeks is offered for removal; new and tray cards are not", () => {
    const events = [view("seen", STALE_DAYS + 5), view("seen", 2)];
    expect(staleWidgets(widgets, events, "u_x", NOW).map((entry) => entry.id)).toEqual(["ignored"]);
  });
});
