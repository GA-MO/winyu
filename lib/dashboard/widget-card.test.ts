import { describe, expect, test } from "bun:test";
import { WIDGET_KINDS, type AccessContext, type NextAction, type WidgetKind, type WidgetSpec } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { TH } from "@/lib/i18n/th";
import { findUser } from "@/lib/data/entities/users";
import { runMetric as placeholderResult } from "@/lib/data/query";
import { templateFor } from "./templates";
import { widgetCard } from "./widget-card";
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

describe("widgetCard", () => {
  test("a dashboard card offers one next step, beside its source line", () => {
    const access = accessOf(RSM);
    const widget = widgetOf("bar", access);
    const actions = [
      { id: "a", kind: "drill", label: "แยกตามจังหวัด", reason: "r", tool: null, input: null, prompt: "p" },
      { id: "b", kind: "drill", label: "แยกตามแบรนด์", reason: "r", tool: null, input: null, prompt: "p" },
    ] as NextAction[];
    const card = widgetCard(widget, placeholderResult(widget.query, access), { actions });
    expect(card.actions[0]?.label).toBe("แยกตามจังหวัด");
  });


  test("every widget kind resolves to a card with numbers and a verified source line", () => {
    const access = accessOf(RSM);
    for (const kind of WIDGET_KINDS) {
      const widget = widgetOf(kind, access);
      const card = widgetCard(widget, placeholderResult(widget.query, access));
      expect(card.denied).toBeNull();
      expect(card.footnote).toContain(TH.dash.trust.verified);
      expect(card.description).toBeNull();
    }
  });

  test("role templates resolve to readable cards for every role", () => {
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
        expect(widgetCard(widget, placeholderResult(widget.query, access)).denied).toBeNull();
      }
    }
  });

  test("a denied metric becomes a warning card instead of numbers", () => {
    const access = accessOf(RSM);
    const widget = widgetOf("metric", access);
    const denied: WidgetSpec = { ...widget, query: { ...widget.query, metric: "headcount" } };
    const result = placeholderResult(denied.query, access);
    expect(result.ok).toBe(false);
    const card = widgetCard(denied, result);
    expect(card.denied).toBeTruthy();
    expect(card.hero).toBeNull();
    expect(JSON.stringify(card)).not.toContain("1,840");
  });

  test("a card leads with the headline number, not a paragraph", () => {
    const access = accessOf(RSM);
    const widget = widgetOf("bar", access);
    const card = widgetCard(widget, placeholderResult(widget.query, access));
    expect(card.hero?.value).toBeDefined();
    expect(card.hero?.value).not.toBe("—");
  });

  test("a metric masked in every row keeps the card as one line and shows no value", () => {
    const access = accessOf("u_siriporn");
    const widget = widgetOf("kv", access);
    const masked: WidgetSpec = { ...widget, query: { ...widget.query, metric: "avg_salary", dims: ["department"] } };
    const result = placeholderResult(masked.query, access);
    expect(result.ok).toBe(true);
    const card = widgetCard(masked, result);
    expect(JSON.stringify(card)).not.toContain("***");
    expect(JSON.stringify(card)).toContain("ถูกปิดตามสิทธิ์");
  });

  test("a handoff carrying an alert leads with the same number as the alert's card", () => {
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
