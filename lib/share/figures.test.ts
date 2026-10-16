import { describe, expect, test } from "bun:test";
import { TH } from "@/lib/i18n/th";
import { contradictionOf, figuresOf } from "./figures";

function answer(compare: string, deltaPercent: number | null, rows: { value: number }[] = [{ value: 100 }], metric = "net_sales_volume") {
  return { ok: true, rows, summary: "", headline: { aggregate: "sum", value: "1", periodLabel: "", rowCount: rows.length, deltaPercent, compareLabel: null, compareNote: null, top: [] }, provenance: {}, query: { metric, compare, dims: [], filters: {}, range: { from: "2026-11-01", to: "2026-11-26" }, grain: "month", limit: null, scopeApplied: {}, labels: {} } };
}

describe("what a card's numbers say", () => {
  test("a card against target tells its attainment, a card against last period its change", () => {
    expect(figuresOf(answer("target", -12.1))).toEqual({ attainment: 87.9, change: null });
    expect(figuresOf(answer("prev_period", -4))).toEqual({ attainment: null, change: -4 });
    expect(figuresOf({ ok: false, error: "x" })).toBeNull();
  });
});

describe("a card in a month still running", () => {
  const projection = { recentDays: 7, projected: "3.4 ล้านลิตร", monthTarget: "3.9 ล้านลิตร", attainment: "85.9%", attainmentToDate: "79.7%", shortBy: "0.79 ล้านลิตร", remaining: "" };
  const running = { ...answer("target", -8), headline: { ...answer("target", -8).headline, projection } };

  test("tells the share of the whole month's target its hero shows, not the pace figure, and the warning quotes it (AI-113)", () => {
    expect(figuresOf(running)?.attainment).toBe(79.7);
    expect(contradictionOf("เก่งมาก ยอดขายเข้าเดือนนี้เกินเป้า", figuresOf(running))).toBe(TH.share.contradicts.atTarget("79.7%"));
  });
});

describe("words that the card's numbers contradict", () => {
  const under = figuresOf(answer("target", -12.1));
  const over = figuresOf(answer("target", 4));
  const fell = figuresOf(answer("prev_period", -6));

  test("'will close over target' against a card at 87.9% of target is flagged with the card's own number", () => {
    expect(contradictionOf("บอกว่าเดือนนี้ผมจะปิดเกินเป้าแน่นอน", under)).toBe(TH.share.contradicts.atTarget("87.9%"));
  });

  test("'not reaching target' is not read as reaching it, and agrees with a card under target", () => {
    expect(contradictionOf("เดือนนี้ไม่ถึงเป้า ช่วยดูหน่อย", under)).toBeNull();
    expect(contradictionOf("เดือนนี้ไม่ถึงเป้า ช่วยดูหน่อย", over)).toBe(TH.share.contradicts.underTarget("104.0%"));
  });

  test("growth claimed on a card that fell is flagged; words the card does not measure are not", () => {
    expect(contradictionOf("ยอดเพิ่มขึ้นดีมาก", fell)).toBe(TH.share.contradicts.rising("-6.0%"));
    expect(contradictionOf("ช่วยดูอุบลศรีสุขหน่อย", under)).toBeNull();
    expect(contradictionOf("จะปิดเกินเป้า", null)).toBeNull();
  });

  test("a number the words claim is checked against the card's own: a growth of 5% on a card up 0.6%, or 110% of target on one at 87.9%", () => {
    const barely = figuresOf(answer("prev_period", 0.6));
    expect(contradictionOf("กำไรขั้นต้นโตขึ้น 5% ตามที่ CFO รายงาน", barely)).toBe(TH.share.contradicts.changeBy("+5.0%", "+0.6%"));
    expect(contradictionOf("ยอดโตขึ้น 0.5%", barely)).toBeNull();
    expect(contradictionOf("ทำได้ 110% ของเป้าแล้ว", under)).toBe(TH.share.contradicts.attainmentBy("110.0%", "87.9%"));
    expect(contradictionOf("ทำได้ 88% ของเป้า", under)).toBeNull();
    expect(contradictionOf("ยังต่ำกว่าเป้า 12% ช่วยดูหน่อย", under)).toBeNull();
  });
});
