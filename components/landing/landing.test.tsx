import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TH } from "@/lib/i18n/th";

mock.module("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }), usePathname: () => "/" }));

const { Landing } = await import("./landing");

const GREETING = { lead: "สวัสดีตอนเช้าครับ", name: "ธนา" };
const KPI = { id: "k1", label: "ยอดขายเข้าเดือนนี้", value: "฿12.4M", delta: "+3.1%", tone: "good" as const, detail: null, note: null, period: "พ.ย." };
const CHIP = { id: "q1", label: "ยอดขายภาคเหนือ", prompt: "ยอดขายภาคเหนือเดือนนี้", score: 1, reason: "ถามบ่อย", intentKey: "sales_north" };
const PLACEHOLDER = "ถาม Winyu เรื่องผู้บริหาร…";

function render(): string {
  return renderToStaticMarkup(<Landing greeting={GREETING} kpis={[KPI]} quickActions={[CHIP]} brief={null} asOf="2026-11-27" placeholder={PLACEHOLDER} />);
}

describe("the home page", () => {
  test("every tile names the period its number covers", () => {
    expect(render()).toContain(`>${KPI.period}</span>`);
  });

  test("reads greeting, then the pinned numbers, then the chips, and ends with the question box near the thumb", () => {
    const html = render();
    const order = [GREETING.name, KPI.value, TH.landing.trust, CHIP.label, `placeholder="${PLACEHOLDER}"`].map((marker) => html.indexOf(marker));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((left, right) => left - right)).toEqual(order);
  });

  test("the tiles open the dashboard and there is no separate dashboard button", () => {
    const html = render();
    expect(html.match(/href="\/dashboard"/g)).toHaveLength(1);
    expect(html).toContain(`aria-label="${TH.landing.kpiOpen}"`);
    expect(html).not.toContain("ดู Dashboard");
    expect(html).not.toContain("⌘D");
  });
});
