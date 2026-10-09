import { describe, expect, test } from "bun:test";
import type { ActionEvent, Alert, FeedItem, MetricQuery, MetricResult, MetricRow, WidgetSpec } from "@/lib/contracts";
import { STALE_DAYS, attentionOf, byAttention, staleWidgets, untouchedTemplates, withFeed } from "./attention";

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
    headline: { aggregate: "sum", value: "1,000 ลัง", periodLabel: "ก.ย.", rowCount: rows.length, deltaPercent, compareLabel: "เทียบช่วงก่อนหน้า", compareNote: null, top: [] },
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

  test("an open alert on the card's metric makes it news without a count line", () => {
    const attention = attentionOf({ widget: widget("w"), result: result(0), alerts: [ALERT] });
    expect(attention.level).toBe("moved");
    expect(attention.reason).toBeNull();
    expect(attentionOf({ widget: widget("w", { query: query({ metric: "gross_margin" }) }), result: result(0), alerts: [ALERT] }).level).toBe("steady");
  });

  test("a level under its floor is news even when it did not move", () => {
    const attainment = widget("w", { query: query({ metric: "target_attainment", compare: "none" }) });
    expect(attentionOf({ widget: attainment, result: result(null, [{ value: 73.2 }]), alerts: [] }).level).toBe("moved");
    expect(attentionOf({ widget: attainment, result: result(null, [{ value: 101 }]), alerts: [] }).level).toBe("steady");
  });

  test("a card whose data could not be read is never counted steady", () => {
    const unread = attentionOf({ widget: widget("w"), result: { ok: false, code: "CONNECTOR_UNAVAILABLE", error: "down" }, alerts: [] });
    expect(unread).toEqual({ level: "moved", reason: null, score: 0 });
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

describe("starter cards the user never looked at", () => {
  const widgets = [widget("seen"), widget("never"), widget("mine", { source: "user_pin" }), widget("tray", { pinned: false })];

  test("none before two weeks of viewing; after, only pinned starter cards with no view ever", () => {
    expect(untouchedTemplates(widgets, [view("seen", 3)], "u_x", NOW)).toEqual([]);
    expect(untouchedTemplates(widgets, [view("seen", STALE_DAYS + 5)], "u_x", NOW).map((entry) => entry.id)).toEqual(["never"]);
  });
});

function feedItem(kind: string, rank: number, source: FeedItem["source"] = "alert"): FeedItem {
  return { key: `${kind}:${rank}`, source, kind, story: null, rank, tone: "warning", label: kind, reason: "", detail: null, prompt: "", alertId: null, packetId: null, canFinish: true, actions: [], because: null };
}

describe("cards about what is on the feed", () => {
  const moved = { widget: widget("moved", { position: 0 }), attention: attentionOf({ widget: widget("moved"), result: result(-30), alerts: [] }) };
  const attrition = widget("attrition", { position: 1, kind: "bar", query: query({ metric: "attrition_rate", dims: ["department"] }) });
  const quiet = { widget: attrition, attention: attentionOf({ widget: attrition, result: result(1), alerts: [] }) };

  test("a steady card about a matter on the feed leads and says which matters", () => {
    const ordered = byAttention(withFeed([moved, quiet], [feedItem("person:risk", 500, "person"), feedItem("person:risk", 450, "person")]));
    expect(ordered.map((entry) => entry.widget.id)).toEqual(["attrition", "moved"]);
    expect(ordered[0].attention.reason).toContain("2 เรื่อง");
  });

  test("the more urgent matter leads, a card already moved keeps its own reason, and a card nothing on the feed is about is untouched", () => {
    const sales = { ...moved, widget: widget("sales", { position: 2 }) };
    const ordered = byAttention(withFeed([quiet, sales], [feedItem("person:risk", 450, "person"), feedItem("alert:net_sales_volume", 900)]));
    expect(ordered.map((entry) => entry.widget.id)).toEqual(["sales", "attrition"]);
    expect(ordered[0].attention.reason).toBe(moved.attention.reason);
    expect(withFeed([quiet], [feedItem("opening", 900, "opening")])[0]).toBe(quiet);
  });
});

describe("a rate over time", () => {
  test("is news when its latest full month moved, the same change its hero shows", () => {
    const monthly = query({ metric: "attrition_rate", dims: ["month"], range: { from: "2026-06-01", to: "2026-09-30" }, compare: "none" });
    const rows: MetricRow[] = [
      { month: "2026-06", value: 1.1 },
      { month: "2026-07", value: 1.1 },
      { month: "2026-08", value: 1.2 },
      { month: "2026-09", value: 0.4 },
    ];
    const averaged = { ...result(null, rows), headline: { aggregate: "average", value: "1.0%", periodLabel: "", rowCount: 4, deltaPercent: null, compareLabel: null, compareNote: null, top: [] } } as MetricResult;
    const attention = attentionOf({ widget: widget("w", { kind: "line", query: monthly }), result: averaged, alerts: [] });
    expect(attention.level).toBe("moved");
    expect(attention.reason).toContain("+9.1%");
  });
});
