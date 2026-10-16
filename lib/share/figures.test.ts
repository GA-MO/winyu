import { describe, expect, test } from "bun:test";
import { TH } from "@/lib/i18n/th";
import { contradictionOf, figuresOf, measureOf } from "./figures";

function answer(compare: string, deltaPercent: number | null, rows: { value: number }[] = [{ value: 100 }], metric = "net_sales_volume") {
  return { ok: true, rows, summary: "", headline: { aggregate: "sum", value: "1", periodLabel: "", rowCount: rows.length, deltaPercent, compareLabel: null, compareNote: null, top: [] }, provenance: {}, query: { metric, compare, dims: [], filters: {}, range: { from: "2026-11-01", to: "2026-11-26" }, grain: "month", limit: null, scopeApplied: {}, labels: {} } };
}

describe("what a card's numbers say", () => {
  test("a card against target tells its attainment, a card against last period its change", () => {
    expect(figuresOf(answer("target", -12.1))).toEqual({ attainment: 87.9, change: null });
    expect(figuresOf(answer("prev_period", -4))).toEqual({ attainment: null, change: -4 });
    expect(figuresOf({ ok: false, error: "x" })).toBeNull();
  });

  test("a goal reads attainment or the total off the result", () => {
    expect(measureOf(answer("target", 3), "attainment")).toBe(103);
    expect(measureOf(answer("none", null, [{ value: 40 }, { value: 60 }]), "total")).toBe(100);
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
});
