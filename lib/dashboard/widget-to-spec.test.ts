import { describe, expect, test } from "bun:test";
import { normalizeSpec } from "vexa/core";
import { copCatalog as catalog } from "@/lib/cards/catalog";
import { WIDGET_KINDS, type AccessContext, type NextAction, type WidgetKind, type WidgetSpec } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { TH } from "@/lib/i18n/th";
import { findUser } from "@/lib/data/entities/users";
import { runMetric as placeholderResult } from "@/lib/data/query";
import { templateFor } from "./templates";
import { widgetToSpec } from "./widget-to-spec";
import { alertRowOf } from "@/lib/cards/alert-row";
import { GENERATOR_DICTIONARY } from "@/lib/data/master";
import { alertCard, itemCard, packetCard } from "./ambient";

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
  test("a dashboard card offers one next step, beside its source line", () => {
    const access = accessOf(RSM);
    const widget = widgetOf("bar", access);
    const actions = [
      { id: "a", kind: "drill", label: "แยกตามจังหวัด", reason: "r", tool: null, input: null, prompt: "p" },
      { id: "b", kind: "drill", label: "แยกตามแบรนด์", reason: "r", tool: null, input: null, prompt: "p" },
    ] as NextAction[];
    const spec = widgetToSpec(widget, placeholderResult(widget.query, access), { actions });
    const footer = spec.elements[`${widget.id}-footer`] as unknown as { props: { action: NextAction | null } };
    expect(footer.props.action?.label).toBe("แยกตามจังหวัด");
    expect(Object.values(spec.elements).some((element) => (element as { type: string }).type === "ActionStrip")).toBe(false);
  });


  test("every widget kind renders a spec the Cop catalog accepts", () => {
    const access = accessOf(RSM);
    for (const kind of WIDGET_KINDS) {
      const widget = widgetOf(kind, access);
      const spec = widgetToSpec(widget, placeholderResult(widget.query, access));
      const result = validate(spec);
      expect(result.success).toBe(true);
      expect(spec.root).toBe(`${widget.id}-root`);
      const card = spec.elements[`${widget.id}-root`] as unknown as { props: { footnote: string | null; description: string | null } };
      const footer = spec.elements[`${widget.id}-footer`] as unknown as { type: string; props: { note: string } } | undefined;
      expect(card.props.footnote).toBeNull();
      expect(footer?.type).toBe("CardFooter");
      expect(footer?.props.note).toContain(TH.dash.trust.verified);
      expect(card.props.description).toBeNull();
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

  test("a card leads with the headline number, not a paragraph", () => {
    const access = accessOf(RSM);
    const widget = widgetOf("bar", access);
    const spec = widgetToSpec(widget, placeholderResult(widget.query, access));
    const hero = spec.elements[`${widget.id}-hero`] as unknown as { type: string; props: { size: string; value: string } };
    expect(hero.type).toBe("Metric");
    expect(hero.props.size).toBe("lg");
    expect(hero.props.value).not.toBe("—");
  });

  test("a metric masked in every row keeps the card as one line and shows no value", () => {
    const access = accessOf("u_siriporn");
    const widget = widgetOf("kv", access);
    const masked: WidgetSpec = { ...widget, query: { ...widget.query, metric: "avg_salary", dims: ["department"] } };
    const result = placeholderResult(masked.query, access);
    expect(result.ok).toBe(true);
    const spec = widgetToSpec(masked, result);
    expect(validate(spec).success).toBe(true);
    expect(JSON.stringify(spec)).not.toContain("***");
    expect(JSON.stringify(spec)).toContain("ถูกปิดตามสิทธิ์");
  });

  test("landing cards of every kind are valid specs", () => {
    const alert = {
      id: "a1", at: "2026-09-22T01:00:00.000Z", severity: "P1" as const, metric: "sell_out_volume" as const, dims: { region: "northeast" },
      window: { from: "2026-09-01", to: "2026-09-22" }, observed: 100, expected: 140, zScore: -3.1, direction: "down" as const,
      hypothesis: "สต๊อกค้างที่เอเย่นต์", verifySteps: ["ตรวจยอดขายออกจากร้าน", "ตรวจสต๊อกที่เอเย่นต์"] as [string, string],
      ownerUserId: RSM, status: "open" as const, dismissCount: 0,
    };
    const row = alertRowOf(alert, GENERATOR_DICTIONARY);
    const cards = [
      alertCard({ alert, row, owner: null, note: null, actions: [] }),
      packetCard({ id: "p1", title: "ยอดอีสานต่ำกว่าเป้า", ask: "ช่วยตรวจเอเย่นต์ที่ยอดตก", fromName: "คุณอนุชา", urgency: "high", carried: alert }, row),
      itemCard({
        key: "person:e1:cert", source: "person", kind: "person:cert", story: null, rank: 700, tone: "danger", label: "คุณแดง ศักดิ์ดี",
        reason: "ใบขับขี่รถยก 8 วัน", detail: "พนักงานขับรถยก", prompt: "ขอดูโปรไฟล์คุณแดง", alertId: null, packetId: null, canFinish: true, actions: [], because: null,
      }),
    ];
    for (const card of cards) expect(validate(card.spec).success).toBe(true);
    expect(cards[1]?.headline?.value).toBe(cards[0]?.headline?.value);
  });

  test("a matter that is not an alert leads with its reason and names its kind", () => {
    const card = itemCard({
      key: "campaign:c1", source: "campaign", kind: "campaign", story: null, rank: 600, tone: "warning", label: "โซดาซัมเมอร์",
      reason: "+12%", detail: "ต่ำกว่าเป้า 35%", prompt: "ผลแคมเปญ", alertId: null, packetId: null, canFinish: true, actions: [], because: null,
    });
    expect(card.headline?.value).toBe("+12%");
    expect(card.eyebrow).toBe(`${TH.severity.P2} · ${TH.feed.sources.campaign}`);
    expect(card.feedKey).toBe("campaign:c1");
  });
});
