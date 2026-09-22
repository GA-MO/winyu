import { describe, expect, test } from "bun:test";
import { normalizeSpec } from "vexa/core";
import { catalog } from "vexa/core";
import { WIDGET_KINDS, type AccessContext, type WidgetKind, type WidgetSpec } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { runMetric as placeholderResult } from "@/lib/data/query";
import { templateFor } from "./templates";
import { widgetToSpec } from "./widget-to-spec";
import { ambientCards } from "./ambient";

const RSM = "u_anucha";
const HR = "u_may";

function accessOf(userId: string): AccessContext {
  const user = findUser(userId);
  if (!user) throw new Error(`missing user ${userId}`);
  return accessFor(user);
}

function widgetOf(kind: WidgetKind, access: AccessContext): WidgetSpec {
  const seed = templateFor(access)[0];
  return {
    id: `w_${kind}`,
    userId: access.userId,
    title: `การ์ด ${kind}`,
    kind,
    query: seed.query,
    pinned: true,
    position: 0,
    source: "role_template",
    reason: null,
    createdAt: "2026-09-22T00:00:00.000Z",
    version: 1,
  };
}

function validate(spec: unknown) {
  return catalog.validate(normalizeSpec(spec as never));
}

describe("widgetToSpec", () => {
  test("every widget kind renders a spec the Vexa catalog accepts", () => {
    const access = accessOf(RSM);
    for (const kind of WIDGET_KINDS) {
      const widget = widgetOf(kind, access);
      const spec = widgetToSpec(widget, placeholderResult(widget.query, access));
      const result = validate(spec);
      expect(result.success).toBe(true);
      expect(spec.root).toBe(`${widget.id}-root`);
      expect(Object.keys(spec.elements)).toContain(`${widget.id}-note`);
    }
  });

  test("role templates resolve to valid specs for every role", () => {
    for (const userId of ["u_thana", "u_siriporn", "u_prasit", RSM, "u_krit", "u_ben", "u_wee", "u_mint", HR, "u_ton"]) {
      const access = accessOf(userId);
      for (const [index, seed] of templateFor(access).entries()) {
        const widget: WidgetSpec = {
          id: `w_${userId}_${seed.key}`,
          userId,
          title: seed.title,
          kind: seed.kind,
          query: seed.query,
          pinned: seed.pinned,
          position: index,
          source: seed.source,
          reason: seed.reason,
          createdAt: "2026-09-22T00:00:00.000Z",
          version: 1,
        };
        expect(validate(widgetToSpec(widget, placeholderResult(widget.query, access))).success).toBe(true);
      }
    }
  });

  test("a denied metric becomes a warning card instead of numbers", () => {
    const access = accessOf(RSM);
    const widget = widgetOf("metric", access);
    const denied: WidgetSpec = { ...widget, query: { ...widget.query, metric: "headcount" } };
    const result = placeholderResult(denied.query, access);
    expect(result.ok).toBe(false);
    const spec = widgetToSpec(denied, result);
    expect(validate(spec).success).toBe(true);
    expect(JSON.stringify(spec)).not.toContain("1,840");
  });

  test("a masked metric keeps the card but hides the value", () => {
    const access = accessOf("u_siriporn");
    const widget = widgetOf("kv", access);
    const masked: WidgetSpec = { ...widget, query: { ...widget.query, metric: "avg_salary", dims: ["department"] } };
    const result = placeholderResult(masked.query, access);
    expect(result.ok).toBe(true);
    const spec = widgetToSpec(masked, result);
    expect(validate(spec).success).toBe(true);
    expect(JSON.stringify(spec)).toContain("***");
  });

  test("ambient cards are valid specs and never exceed three", () => {
    const cards = ambientCards({
      alert: {
        id: "a1", at: "2026-09-22T01:00:00.000Z", severity: "P1", metric: "sell_out_volume", dims: { region: "northeast" },
        window: { from: "2026-09-01", to: "2026-09-22" }, observed: 100, expected: 140, zScore: -3.1, direction: "down",
        hypothesis: "สต๊อกค้างที่เอเย่นต์", verifySteps: ["ตรวจยอดขายออกจากร้าน", "ตรวจสต๊อกที่เอเย่นต์"],
        ownerUserId: RSM, status: "open", dismissCount: 0,
      },
      packet: { id: "p1", title: "ยอดอีสานต่ำกว่าเป้า", ask: "ช่วยตรวจเอเย่นต์ที่ยอดตก", fromName: "คุณอนุชา", urgency: "high" },
      bullets: ["ทดสอบสรุปเช้า"],
      brief: "วันนี้ยังไม่มีอะไรผิดปกติ",
      counts: { alerts: 1, packets: 1, widgets: 4 },
    });
    expect(cards.length).toBe(3);
    for (const card of cards) expect(validate(card.spec).success).toBe(true);
  });
});
