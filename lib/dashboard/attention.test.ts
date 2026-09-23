import { describe, expect, test } from "bun:test";
import type { ActionEvent, Alert, MetricQuery, MetricResult, MetricRow, WidgetSpec } from "@/lib/contracts";
import { STALE_DAYS, attentionOf, byAttention, staleWidgets } from "./attention";

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

const ALERT = { id: "a1", metric: "net_sales_volume", severity: "P2" } as Alert;

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

function scoreOf(card: WidgetSpec, cardResult: MetricResult, alerts: Alert[] = []): number {
  return attentionOf({ widget: card, result: cardResult, alerts }).score;
}

describe("which card is read first", () => {
  const byAgent = widget("w", { kind: "bar", query: query({ dims: ["agent"] }) });
  const attainment = widget("w", { query: query({ metric: "target_attainment", compare: "none" }) });

  test("steady scores nothing", () => {
    expect(scoreOf(widget("w"), result(1))).toBe(0);
  });

  test("an alert outranks a level under its floor, which outranks a moved headline, which outranks one fallen row", () => {
    const alert = scoreOf(widget("w"), result(0), [ALERT]);
    const floor = scoreOf(attainment, result(null, [{ value: 90 }]));
    const headline = scoreOf(widget("w"), result(60));
    const row = scoreOf(byAgent, result(1, [{ agent: "ส.รุ่งเรือง", value: 1, delta_pct: -99 }]));
    expect(alert).toBeGreaterThan(floor);
    expect(floor).toBeGreaterThan(headline);
    expect(headline).toBeGreaterThan(row);
    expect(row).toBeGreaterThan(0);
  });

  test("a worse alert outranks a milder one, whatever the count", () => {
    const p1 = scoreOf(widget("w"), result(0), [{ ...ALERT, severity: "P1" }]);
    const p3s = scoreOf(widget("w"), result(0), [1, 2, 3, 4, 5].map((index) => ({ ...ALERT, id: `a${index}`, severity: "P3" }) as Alert));
    expect(p1).toBeGreaterThan(p3s);
  });

  test("further under the floor ranks higher", () => {
    expect(scoreOf(attainment, result(null, [{ value: 60 }]))).toBeGreaterThan(scoreOf(attainment, result(null, [{ value: 90 }])));
  });

  test("a harmful move outranks a bigger good one, and a bigger move outranks a smaller one in the same direction", () => {
    expect(scoreOf(widget("w"), result(-6))).toBeGreaterThan(scoreOf(widget("w"), result(40)));
    expect(scoreOf(widget("w"), result(-20))).toBeGreaterThan(scoreOf(widget("w"), result(-6)));
  });

  test("the order puts the most urgent first and keeps the saved position between equals", () => {
    const views = [
      { widget: widget("quiet_b", { position: 1 }), attention: attentionOf({ widget: widget("quiet_b"), result: result(1), alerts: [] }) },
      { widget: widget("small", { position: 2 }), attention: attentionOf({ widget: widget("small"), result: result(-6), alerts: [] }) },
      { widget: widget("quiet_a", { position: 0 }), attention: attentionOf({ widget: widget("quiet_a"), result: result(1), alerts: [] }) },
      { widget: widget("alert", { position: 3 }), attention: attentionOf({ widget: widget("alert"), result: result(0), alerts: [ALERT] }) },
    ];
    expect(byAttention(views).map((entry) => entry.widget.id)).toEqual(["alert", "small", "quiet_a", "quiet_b"]);
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
