import { describe, expect, test } from "bun:test";
import type { MetricQuery, MetricResult } from "@/lib/contracts";
import { presentCard } from "./present";
import {
  boardVerdict,
  changeVerdict,
  compactPeriod,
  leadingExceptions,
  lineVerdict,
  magnitudeWords,
  outliersOf,
  percentText,
  rangeText,
  referenceVerdict,
  shareVerdict,
  spaced,
  spanText,
  summaryVerdict,
  thresholdVerdict,
  trendVerdict,
} from "./reading";

const TARGET = { kind: "target" } as const;
const COVER = { kind: "cover", days: 10 } as const;

describe("which rows stand apart", () => {
  test("a change ranking keeps the leading rows before the widest step, and none when no step stands out", () => {
    expect(leadingExceptions([-48.9, -48.6, -12.9, -11.6, -10.8], 5)).toBe(2);
    expect(leadingExceptions([-28.4, -28.2, -28.2, -28.0, -27.8], 5)).toBe(0);
    expect(leadingExceptions([-30], 5)).toBe(1);
  });

  test("a leaderboard's notable changes are the smaller side of the widest step, on either end", () => {
    expect([...outliersOf([-32.9, -17.6, -32.2, -20.7, -32.8, -36.6], 5)].sort()).toEqual([1, 3]);
    expect([...outliersOf([-10.1, -9.8, -10.3, 12], 5)]).toEqual([3]);
    expect(outliersOf([-10.1, -9.8, -10.3, -9.9], 5).size).toBe(0);
    expect(outliersOf([1, 50], 5).size).toBe(0);
  });
});

describe("words for numbers", () => {
  test("a move reads as near half, over half or over double; several rows read as more than the mildest", () => {
    expect(magnitudeWords(48.6, true, "percent")).toBe("เกือบครึ่ง");
    expect(magnitudeWords(61, false, "percent")).toBe("เกินครึ่ง");
    expect(magnitudeWords(303.2, false, "percent")).toBe("กว่าเท่าตัว");
    expect(magnitudeWords(38.4, true, "percent")).toBe("กว่า 38%");
    expect(magnitudeWords(6.73, false, "points")).toBe("6.7 จุด");
  });

  test("ranges, spans and spacing read the way Thai writes them", () => {
    expect(rangeText([10.8, 12.9], percentText)).toBe("10.8–12.9%");
    expect(rangeText([-11.6, -1.1], percentText)).toBe("-11.6% ถึง -1.1%");
    expect(spanText("2026-09-01", "2026-09-22")).toBe("1–22 ก.ย. 2569");
    expect(compactPeriod("1 เม.ย. 2569 – 22 ก.ย. 2569")).toBe("1 เม.ย. – 22 ก.ย. 2569");
    expect(spaced("ต่ำสุดDC เชียงใหม่ลดลง6.7 จุด")).toBe("ต่ำสุด DC เชียงใหม่ลดลง 6.7 จุด");
  });
});

describe("one verdict per rule, built only from the result", () => {
  test("R1: one row against its target says how far short it is, or that it made it", () => {
    expect(summaryVerdict({ label: "ภาคอีสาน", attainment: 93.3, change: null, changeText: null, flat: false, versus: "", value: "3.9 ล้านลิตร" })).toBe("ภาคอีสานยังขาดเป้า 6.7%");
    expect(summaryVerdict({ label: "ภาคใต้", attainment: 101.2, change: null, changeText: null, flat: false, versus: "", value: "x" })).toBe("ภาคใต้ถึงเป้าแล้ว");
  });

  test("R2 and a total: one number says which way it moved and against what", () => {
    expect(summaryVerdict({ label: "มูลค่าขายเข้า", attainment: null, change: -11.5, changeText: "-11.5%", flat: false, versus: "เทียบช่วงก่อนหน้า", value: "1,110.2 ล้านบาท" })).toBe("มูลค่าขายเข้าลดลง 11.5% เทียบช่วงก่อนหน้า");
    expect(summaryVerdict({ label: "สต๊อก", attainment: null, change: 0.4, changeText: "+0.4%", flat: true, versus: "", value: "x" })).toBe("สต๊อกทรงตัว");
  });

  test("R3: against a target the verdict names the one group that sank the total, or counts them with the worst", () => {
    const base = { line: TARGET, unit: "ภาค", of: 6, overallUnder: true, goal: "เป้า", sums: true, weakest: null, slice: null, averaged: false };
    expect(lineVerdict({ ...base, count: 1, worst: "ภาคอีสาน" })).toBe("ยอดรวมหลุดเป้าเพราะภาคอีสานภาคเดียว");
    expect(lineVerdict({ ...base, count: 1, worst: "ภาคอีสาน", overallUnder: false })).toBe("ภาคอีสานภาคเดียวยังไม่ถึงเป้า");
    expect(lineVerdict({ ...base, unit: "จังหวัด", of: 24, count: 3, worst: "อุบลราชธานี" })).toBe("3 จังหวัดต่ำกว่าเป้า หนักสุดอุบลราชธานี");
    expect(lineVerdict({ ...base, count: 0, worst: null })).toBe("ทุกภาคถึงเป้า");
    expect(lineVerdict({ ...base, unit: "เอเย่นต์", of: 4, count: 3, worst: "อีสานรุ่งโรจน์ ค้าส่ง", goal: "เป้าตามเวลา" })).toBe("3 เอเย่นต์ต่ำกว่าเป้าตามเวลา หนักสุดอีสานรุ่งโรจน์ ค้าส่ง");
  });

  test("R4: a change ranking says how many moved clear of the rest and by how much in words, or plainly that none did", () => {
    const format = percentText;
    expect(changeVerdict({ unit: "เอเย่นต์", falling: true, sums: true, inPoints: false, leading: [{ label: "ก", size: 48.9 }, { label: "ข", size: 48.6 }], changes: [-48.9, -48.6, -12.9], format, slice: null })).toBe("2 เอเย่นต์ยอดหายเกือบครึ่ง");
    expect(spaced(changeVerdict({ unit: "จังหวัด", falling: true, sums: false, inPoints: true, leading: [{ label: "นครราชสีมา", size: 6.7 }], changes: [-6.7, -1.5], format, slice: null }))).toBe("นครราชสีมาลดลง 6.7 จุด");
    expect(changeVerdict({ unit: "เอเย่นต์", falling: true, sums: true, inPoints: false, leading: [], changes: [-28.4, -27.8], format, slice: null })).toBe("ทุกเอเย่นต์ลดลงใกล้กัน 27.8–28.4%");
    expect(changeVerdict({ unit: "เอเย่นต์", falling: true, sums: true, inPoints: false, leading: [], changes: [3, 5], format, slice: null })).toBe("ไม่มีเอเย่นต์ไหนลดลง");
    expect(changeVerdict({ unit: "SKU", falling: true, sums: true, inPoints: false, leading: [], changes: [-48.9, -46, -43.9], format, slice: "10 SKU ที่ลดลงมากสุด" })).toBe("10 SKU ที่ลดลงมากสุด ลดลง 43.9–48.9%");
  });

  test("R5 leaderboard: the row whose change stands apart and whether it moved more, less or against the rest", () => {
    const format = percentText;
    const labels = ["กรุงเทพฯ", "ภาคอีสาน", "ภาคใต้", "ภาคกลาง"];
    expect(boardVerdict({ unit: "ภาค", labels, changes: [-10.1, -9.8, -10.3, 12], notable: new Set([3]), format, slice: null })).toBe("ภาคกลางเพิ่มขึ้น 12.0% สวนทางภาคอื่น");
    expect(boardVerdict({ unit: "ภาค", labels, changes: [-17.6, -36.6, -32.9, -20.7], notable: new Set([0, 3]), format, slice: null })).toBe("กรุงเทพฯกับภาคกลางลดลงน้อยกว่าภาคอื่น");
    expect(boardVerdict({ unit: "ภาค", labels, changes: [-10, -9, -11, -10], notable: new Set(), format, slice: null })).toBe("กรุงเทพฯมากสุด ทุกภาคลดลงใกล้กัน");
  });

  test("R5 rate ranking: the row clear above the rest, else the highest and the lowest with their values", () => {
    const labels = ["ซีสโตร์", "ลีโอ", "สิงห์"];
    expect(referenceVerdict({ unit: "แคมเปญ", labels, values: [35.3, 12, 11], texts: ["35.3%", "12%", "11%"], outliers: new Set([0]) })).toBe("ซีสโตร์สูงกว่าแคมเปญอื่นชัด");
    expect(referenceVerdict({ unit: "ฝ่าย", labels, values: [1.5, 1.2, 0.8], texts: ["1.5%", "1.2%", "0.8%"], outliers: new Set() })).toBe("ซีสโตร์สูงสุด 1.5% ต่ำสุดสิงห์ 0.8%");
  });

  test("R6: against the low-cover line the verdict names the lowest when nothing is under, else counts the ones under", () => {
    const base = { line: COVER, unit: "DC", of: 8, overallUnder: false, goal: "เป้า", sums: false, slice: null, averaged: false };
    expect(lineVerdict({ ...base, count: 0, worst: null, weakest: { label: "DC เชียงใหม่", text: "13.9 วัน" } })).toBe("DC เชียงใหม่ เหลือน้อยสุด 13.9 วัน ยังเกิน 10 วัน");
    expect(spaced(lineVerdict({ ...base, count: 2, worst: "DC ลำพูน", weakest: null }))).toBe("2 DC สต๊อกพอขายไม่ถึง 10 วัน หนักสุด DC ลำพูน");
  });

  test("R7: a threshold the question set is counted against every group in scope", () => {
    expect(thresholdVerdict(1, 30, "SKU", "สต๊อกพอขายต่ำกว่า 10 วัน")).toBe("1 จาก 30 SKU สต๊อกพอขายต่ำกว่า 10 วัน");
  });

  test("R9: a trend reads its latest full bucket against the one before", () => {
    expect(trendVerdict("ส.ค. 69", "ก.ค. 69", -27.3, "-27.3%", false)).toBe("ส.ค. 69 ลดลง 27.3% จาก ก.ค. 69");
    expect(trendVerdict("ส.ค. 69", "ก.ค. 69", 0.5, "+0.5%", true)).toBe("ส.ค. 69 ทรงตัวจาก ก.ค. 69");
  });

  test("a donut says who holds more than half, else who leads and who follows", () => {
    expect(shareVerdict(["บุญรอดบริวเวอรี่", "ไทยเบฟ"], 0.577)).toBe("บุญรอดบริวเวอรี่ครองเกินครึ่ง");
    expect(shareVerdict(["โมเดิร์นเทรด", "ร้านค้าปลีกดั้งเดิม"], 0.359)).toBe("โมเดิร์นเทรดมากสุด ตามด้วยร้านค้าปลีกดั้งเดิม");
  });
});

function regionBreakdown(changes: number[]): { query: MetricQuery; result: MetricResult } {
  const regions = ["ภาคกลาง", "ภาคเหนือ", "ภาคใต้", "ภาคตะวันออก"];
  const query: MetricQuery = { metric: "net_sales_value", dims: ["region"], filters: {}, range: { from: "2026-09-01", to: "2026-09-22" }, grain: "month", compare: "prev_period", limit: null };
  const rows = regions.map((region, index) => ({ region, value: 100 - index * 10, value_label: `${100 - index * 10} ล้านบาท`, delta_pct: changes[index] }));
  return {
    query,
    result: {
      ok: true,
      rows,
      summary: "",
      headline: { aggregate: "sum", value: "340 ล้านบาท", periodLabel: "1 ก.ย. 2569 – 22 ก.ย. 2569", rowCount: rows.length, deltaPercent: -5, compareLabel: "เทียบช่วงก่อนหน้า", compareNote: null, top: [] },
      provenance: { metric: "net_sales_value", certified: true, sourceSystem: "SAP SD", asOf: "2026-09-22", rowCount: rows.length, masked: [], trust: "verified" },
      query: { ...query, scopeApplied: {}, labels: {} },
    },
  };
}

describe("a plain region breakdown is a leaderboard", () => {
  test("with one outlier change only that row's pill is coloured, every other pill grey, and the verdict names it", () => {
    const { query, result } = regionBreakdown([-10.1, -9.8, -10.3, 12]);
    const card = presentCard({ title: "t", query, result });
    expect(card.style).toBe("picture");
    if (card.body.kind !== "strip") throw new Error(card.body.kind);
    expect(card.body.strip.form).toBe("board");
    expect(card.body.strip.rows.map((row) => [row.label, row.tone])).toEqual([
      ["ภาคกลาง", "neutral"],
      ["ภาคเหนือ", "neutral"],
      ["ภาคใต้", "neutral"],
      ["ภาคตะวันออก", "good"],
    ]);
    expect(card.verdict).toBe("ภาคตะวันออกเพิ่มขึ้น 12.0% สวนทางภาคอื่น");
  });

  test("with every change alike no pill is coloured and the verdict says who leads", () => {
    const { query, result } = regionBreakdown([-10.1, -9.8, -10.3, -9.9]);
    const card = presentCard({ title: "t", query, result });
    if (card.body.kind !== "strip") throw new Error(card.body.kind);
    expect(card.body.strip.rows.every((row) => row.tone === "neutral")).toBe(true);
    expect(card.verdict).toBe("ภาคกลางมากสุด ทุกภาคลดลงใกล้กัน");
  });
});
