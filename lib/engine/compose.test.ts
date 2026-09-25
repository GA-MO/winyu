import { afterEach, describe, expect, test } from "bun:test";
import type { AccessContext, ActionEvent, WidgetSpec } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { layoutVersions, layouts } from "@/lib/server/agent/collections";
import { layoutFor, layoutHistory, pinNewWidget, removeWidget, rollbackToYesterday, setWidgetPinned } from "@/lib/server/dashboard";
import { TEMPLATE_ROLES, templateFor } from "@/lib/dashboard/templates";
import { widgetToSpec } from "@/lib/dashboard/widget-to-spec";
import { runMetric } from "@/lib/data/query";
import { normalizeSpec } from "vexa/core";
import { copCatalog as catalog } from "@/lib/cards/catalog";
import { CLUSTER_DAYS, MIN_REPEATS, candidatesFrom, composeSuggestion, feedCandidatesFrom, isPinnedSlice, kindFor, queryFor, shouldOfferPin } from "./compose";
import { feedIntentKey } from "./feed-learning";

const USER = "u_anucha";

function validate(spec: unknown) {
  return catalog.validate(normalizeSpec(spec as never));
}

const NOW = Date.parse("2026-09-22T09:00:00.000Z");
const DAY_MS = 86_400_000;

function access(userId = USER): AccessContext {
  const user = findUser(userId);
  if (!user) throw new Error(`missing demo user ${userId}`);
  return accessFor(user);
}

function event(id: string, intentKey: string, daysAgo: number): ActionEvent {
  const [metric, dims] = intentKey.split("|");
  return {
    id: `test_${id}`,
    userId: USER,
    at: new Date(NOW - daysAgo * DAY_MS).toISOString(),
    kind: "question",
    intentKey,
    metric: metric as ActionEvent["metric"],
    dims: dims ? (dims.split(",") as ActionEvent["dims"]) : [],
    prompt: `ยอดขายแยกตาม ${dims}`,
    threadId: null,
  };
}

function feedOpen(id: string, kind: string, key: string, daysAgo: number): ActionEvent {
  return { id: `test_${id}`, userId: USER, at: new Date(NOW - daysAgo * DAY_MS).toISOString(), kind: "feed_open", intentKey: feedIntentKey(kind, key), metric: null, dims: [], prompt: `ถามเรื่อง ${key}`, threadId: null };
}

function widgetView(widgetId: string, daysAgo: number): ActionEvent {
  return { id: `test_view_${widgetId}_${daysAgo}`, userId: USER, at: new Date(NOW - daysAgo * DAY_MS).toISOString(), kind: "widget_view", intentKey: `widget:${widgetId}`, metric: null, dims: [], prompt: null, threadId: null };
}

let seeded: ActionEvent[] = [];

function seed(events: ActionEvent[]): void {
  seeded = [...seeded, ...events];
}

afterEach(() => {
  seeded = [];
});

describe("dashboard composer", () => {
  test("an intent repeated three times in the window becomes a candidate", () => {
    const events = [event("a1", "net_sales_volume|agent", 1), event("a2", "net_sales_volume|agent", 3), event("a3", "net_sales_volume|agent", 5)];
    const candidates = candidatesFrom(events, USER, NOW);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].count).toBe(MIN_REPEATS);
  });

  test("two repeats are not enough and old repeats fall out of the window", () => {
    expect(candidatesFrom([event("b1", "gross_margin|month", 1), event("b2", "gross_margin|month", 2)], USER, NOW)).toHaveLength(0);
    const stale = [event("c1", "gross_margin|month", CLUSTER_DAYS + 1), event("c2", "gross_margin|month", CLUSTER_DAYS + 2), event("c3", "gross_margin|month", CLUSTER_DAYS + 3)];
    expect(candidatesFrom(stale, USER, NOW)).toHaveLength(0);
  });

  test("the widget kind follows the dimensions", () => {
    expect(kindFor([])).toBe("metric");
    expect(kindFor(["week"])).toBe("line");
    expect(kindFor(["agent"])).toBe("bar");
  });

  test("the suggested query is scoped to the user's own regions", () => {
    const query = queryFor({ intentKey: "net_sales_volume|agent", metric: "net_sales_volume", dims: ["agent"], count: 3, prompt: "" }, access());
    expect(query.filters.region).toEqual(["northeast"]);
    expect(query.compare).toBe("prev_period");
  });

  test("a metric the role cannot read in full is never suggested", async () => {
    seed([event("d1", "avg_salary|department", 1), event("d2", "avg_salary|department", 2), event("d3", "avg_salary|department", 3)]);
    expect(candidatesFrom(seeded, USER, NOW)[0].metric).toBe("avg_salary");
    expect(await composeSuggestion(access(), [], NOW, seeded)).toBeNull();
  });

  test("only one suggestion a day and never a slice the user already has", async () => {
    seed([event("e1", "days_of_cover|dc", 1), event("e2", "days_of_cover|dc", 2), event("e3", "days_of_cover|dc", 3)]);
    const suggestion = await composeSuggestion(access(), [], NOW, seeded);
    expect(suggestion?.source).toBe("ai_suggested");
    expect(suggestion?.reason).toContain("3 ครั้ง");
    expect(await composeSuggestion(access(), [suggestion as WidgetSpec], NOW, seeded)).toBeNull();
  });

  test("the third repeat is the moment to offer a pin", () => {
    seed([event("f1", "sell_out_volume|brand", 1), event("f2", "sell_out_volume|brand", 2)]);
    expect(shouldOfferPin(USER, "sell_out_volume|brand", NOW, seeded)).toBe(false);
    seed([event("f3", "sell_out_volume|brand", 3)]);
    expect(shouldOfferPin(USER, "sell_out_volume|brand", NOW, seeded)).toBe(true);
  });
});

describe("role templates", () => {
  for (const role of TEMPLATE_ROLES) {
    test(`${role} renders valid specs for every seeded widget`, () => {
      const user = findUser(USER);
      if (!user) throw new Error("missing demo user");
      const roleAccess = { ...accessFor(user), role };
      for (const [position, seed] of templateFor(roleAccess).entries()) {
        const widget: WidgetSpec = {
          id: `w_${role}_${seed.key}`,
          userId: roleAccess.userId,
          title: seed.title,
          kind: seed.kind,
          query: seed.query,
          pinned: seed.pinned,
          position,
          source: seed.source,
          reason: seed.reason,
          createdAt: "2026-09-22T00:00:00.000Z",
          version: 1,
        };
        const spec = widgetToSpec(widget, runMetric(widget.query, roleAccess));
        expect(validate(spec).success).toBe(true);
      }
    });
  }
});

describe("layout versioning", () => {
  const VERSION_USER = "u_wee";

  afterEach(() => {
    layouts().remove(VERSION_USER);
    for (const entry of layoutVersions().where((item) => item.userId === VERSION_USER)) layoutVersions().remove(entry.id);
  });

  test("every change writes a new version and rollback restores an earlier day", () => {
    const planner = access(VERSION_USER);
    const first = layoutFor(planner);
    const widgetId = first.widgets[0].id;
    const removed = removeWidget(planner, widgetId);
    expect(removed.version).toBeGreaterThan(first.version);
    expect(removed.widgets[0].id).not.toBe(widgetId);

    const yesterday = new Date(Date.now() - DAY_MS).toISOString();
    layoutVersions().put({ id: `${VERSION_USER}_0`, userId: VERSION_USER, version: 0, widgets: first.widgets, savedAt: yesterday });
    const restored = rollbackToYesterday(planner);
    expect(restored?.widgets[0].id).toBe(widgetId);
    expect(restored?.version).toBeGreaterThan(removed.version);
  });

  test("unpinning is versioned too", () => {
    const planner = access(VERSION_USER);
    const layout = layoutFor(planner);
    const target = layout.widgets.find((widget) => widget.pinned) as WidgetSpec;
    const after = setWidgetPinned(planner, target.id, false);
    expect(after.widgets.find((widget) => widget.id === target.id)?.pinned).toBe(false);
    expect(after.version).toBeGreaterThan(layout.version);
  });

  test("a card pinned from chat before the first visit lands after the starter cards and in the history", () => {
    const planner = access(VERSION_USER);
    const card = templateFor(planner)[0];
    const widget = pinNewWidget(planner, { title: "การ์ดจากแชต", kind: card.kind, query: card.query });
    const layout = layoutFor(planner);
    expect(layout.widgets).toHaveLength(templateFor(planner).length + 1);
    expect(layout.widgets.at(-1)?.id).toBe(widget.id);
    expect(widget.position).toBe(templateFor(planner).length);
    expect(layoutHistory(planner)[0].widgets.some((entry) => entry.id === widget.id)).toBe(true);
  });
});

describe("already on the dashboard", () => {
  test("a pinned card on the same metric and dimensions counts, in any dimension order; a tray suggestion does not", () => {
    const [widget] = templateFor(access()).filter((seed) => seed.pinned && seed.query.dims.length > 0);
    if (!widget) throw new Error("no pinned template widget");
    const pinned = { ...widget, id: "w1", userId: USER, position: 0, createdAt: "", version: 1 } as WidgetSpec;
    const slice = { metric: pinned.query.metric, dims: [...pinned.query.dims].reverse() };
    expect(isPinnedSlice([pinned], slice)).toBe(true);
    expect(isPinnedSlice([{ ...pinned, pinned: false }], slice)).toBe(false);
    expect(isPinnedSlice([pinned], { metric: pinned.query.metric, dims: [] })).toBe(false);
  });
});

describe("the dashboard learns from the feed", () => {
  const byAgent = () => ["agent" as const];

  test("a kind opened on three separate days in two weeks becomes a candidate; two days, or three opens on one day, do not", () => {
    const twoDays = [feedOpen("g1", "alert:net_sales_volume", "alert:a1", 1), feedOpen("g2", "alert:net_sales_volume", "alert:a2", 1), feedOpen("g3", "alert:net_sales_volume", "alert:a3", 4)];
    expect(feedCandidatesFrom(twoDays, USER, NOW, byAgent)).toEqual([]);
    const threeDays = [...twoDays, feedOpen("g4", "alert:net_sales_volume", "alert:a1", 9)];
    const [candidate] = feedCandidatesFrom(threeDays, USER, NOW, byAgent);
    expect(candidate).toMatchObject({ kind: "alert:net_sales_volume", metric: "net_sales_volume", dims: ["agent"], count: 3 });
    const tooOld = [...twoDays, feedOpen("g5", "alert:net_sales_volume", "alert:a1", CLUSTER_DAYS + 1)];
    expect(feedCandidatesFrom(tooOld, USER, NOW, byAgent)).toEqual([]);
  });

  test("a kind no metric tells never becomes a card", () => {
    const licences = [1, 3, 5].map((daysAgo) => feedOpen(`h${daysAgo}`, "person:cert", `person:p1:cert`, daysAgo));
    expect(feedCandidatesFrom(licences, USER, NOW)).toEqual([]);
  });

  test("the feed suggestion comes before a repeated question, says why, and is not offered again once taken off the tray", async () => {
    seed([1, 3, 5].map((daysAgo) => feedOpen(`i${daysAgo}`, "alert:net_sales_volume", "alert:missing", daysAgo)));
    seed([event("i7", "days_of_cover|dc", 1), event("i8", "days_of_cover|dc", 2), event("i9", "days_of_cover|dc", 3)]);
    const suggestion = await composeSuggestion(access(), [], NOW, seeded);
    expect(suggestion?.query.metric).toBe("net_sales_volume");
    expect(suggestion?.reason).toContain("3 วันใน 14 วัน");
    expect(suggestion?.pinned).toBe(false);
    seed([{ ...event("i10", "x", 0), kind: "dismiss", intentKey: `widget:${suggestion?.id}`, metric: null }]);
    const next = await composeSuggestion(access(), [], NOW, seeded);
    expect(next?.query.metric).toBe("days_of_cover");
  });

  test("a question the user keeps asking is offered in place of a starter card they never looked at, once there are two weeks of viewing", async () => {
    const starters = templateFor(access())
      .filter((entry) => entry.pinned)
      .map((entry, position) => ({ ...entry, id: `w_${entry.key}`, userId: USER, position, createdAt: "2026-09-01T00:00:00.000Z", version: 1 }) as WidgetSpec);
    const [looked, ...never] = starters;
    seed([event("j1", "days_of_cover|dc", 1), event("j2", "days_of_cover|dc", 2), event("j3", "days_of_cover|dc", 3)]);
    seed([widgetView(looked.id, 2)]);
    const early = await composeSuggestion(access(), starters, NOW, seeded);
    expect(early?.replaces).toBeNull();
    seed([widgetView(looked.id, CLUSTER_DAYS + 2), ...never.slice(1).map((widget) => widgetView(widget.id, 1))]);
    const swap = await composeSuggestion(access(), starters, NOW, seeded);
    expect(swap?.replaces).toBe(never[0].id);
    expect(swap?.reason).toContain(never[0].title);
  });
});

describe("accepting a swap", () => {
  const SWAP_USER = "u_wee";

  afterEach(() => {
    layouts().remove(SWAP_USER);
    for (const entry of layoutVersions().where((item) => item.userId === SWAP_USER)) layoutVersions().remove(entry.id);
  });

  test("pinning a suggestion made in place of a starter card moves the starter card to the tray", () => {
    const planner = access(SWAP_USER);
    const layout = layoutFor(planner);
    const starter = layout.widgets.find((widget) => widget.pinned) as WidgetSpec;
    const suggestion: WidgetSpec = { ...starter, id: "w_ai_swap", pinned: false, source: "ai_suggested", replaces: starter.id, position: layout.widgets.length };
    layouts().put({ ...layout, widgets: [...layout.widgets, suggestion] });
    const after = setWidgetPinned(planner, suggestion.id, true);
    expect(after.widgets.find((widget) => widget.id === suggestion.id)?.pinned).toBe(true);
    expect(after.widgets.find((widget) => widget.id === starter.id)?.pinned).toBe(false);
  });
});
