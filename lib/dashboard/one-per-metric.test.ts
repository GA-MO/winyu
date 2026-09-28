import { describe, expect, test } from "bun:test";
import type { WidgetSpec } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { USERS, findUser } from "@/lib/data/entities/users";
import { TEMPLATE_ROLES, templateFor } from "./templates";
import { displacedBy, onePinnedPerMetric, repeatsPinned, topicOf } from "./one-per-metric";

function card(id: string, metric: WidgetSpec["query"]["metric"], extra: Partial<WidgetSpec> = {}): WidgetSpec {
  return {
    id,
    userId: "u_test",
    title: id,
    kind: "bar",
    query: { metric, dims: [], filters: {}, range: { from: "2026-09-01", to: "2026-09-22" }, grain: "month", compare: "none", limit: null },
    pinned: true,
    position: 0,
    source: "role_template",
    reason: null,
    createdAt: "2026-09-22T00:00:00.000Z",
    version: 1,
    ...extra,
  };
}

function pinnedIds(widgets: readonly WidgetSpec[]): string[] {
  return widgets.filter((widget) => widget.pinned).map((widget) => widget.id);
}

describe("one pinned card per metric", () => {
  test("the user's own pin wins over a starter card on the same metric, which moves to the tray", () => {
    const settled = onePinnedPerMetric([card("starter", "ar_overdue"), card("mine", "ar_overdue", { source: "user_pin", position: 1 }), card("other", "gross_margin")]);
    expect(pinnedIds(settled)).toEqual(["mine", "other"]);
    expect(settled.find((widget) => widget.id === "starter")?.pinned).toBe(false);
    expect(settled).toHaveLength(3);
  });

  test("the card being pinned wins even over an older pin of the user's", () => {
    const settled = onePinnedPerMetric([card("old", "headcount", { source: "user_pin" }), card("new", "headcount", { source: "role_template", position: 3 })], "new");
    expect(pinnedIds(settled)).toEqual(["new"]);
  });

  test("any two alert lists are one topic whatever placeholder query they carry", () => {
    const first = card("alerts", "sell_out_volume", { kind: "alert_list" });
    const second = card("pinned alerts", "net_sales_volume", { kind: "alert_list", source: "user_pin" });
    expect(topicOf(first)).toBe(topicOf(second));
    expect(pinnedIds(onePinnedPerMetric([first, second]))).toEqual(["pinned alerts"]);
    expect(displacedBy([first], second).map((widget) => widget.id)).toEqual(["alerts"]);
  });

  test("among starter cards the one first in the layout stays", () => {
    expect(pinnedIds(onePinnedPerMetric([card("b", "attrition_rate", { position: 2 }), card("a", "attrition_rate", { position: 1 })]))).toEqual(["a"]);
  });

  test("no role template pins two cards on one topic", () => {
    for (const role of TEMPLATE_ROLES) {
      const user = USERS.find((entry) => entry.role === role) ?? findUser("u_thana");
      if (!user) throw new Error(`no user for ${role}`);
      const topics = templateFor(accessFor(user)).filter((seed) => seed.pinned).map(topicOf);
      expect({ role, duplicates: topics.filter((topic, index) => topics.indexOf(topic) !== index) }).toEqual({ role, duplicates: [] });
    }
  });
});

describe("the tray does not repeat a pinned card", () => {
  test("a second alert list is not offered while one is pinned, whatever it is called", () => {
    const pinned = card("mine", "sell_out_volume", { kind: "alert_list", source: "user_pin" });
    const starter = card("starter", "sell_out_volume", { kind: "alert_list", pinned: false });
    expect(repeatsPinned(starter, [pinned, starter])).toBe(true);
    expect(repeatsPinned(starter, [starter])).toBe(false);
  });

  test("a starter card on a pinned metric is still offered, it draws a different breakdown", () => {
    const pinned = card("mine", "days_of_cover", { source: "user_pin" });
    const starter = card("starter", "days_of_cover", { pinned: false });
    expect(repeatsPinned(starter, [pinned, starter])).toBe(false);
  });
});
