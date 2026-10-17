import { describe, expect, test } from "bun:test";
import { queryMetricTool } from "./query-metric";

const PACED = "เทียบเป้าตามเวลา";
const MONTH_SO_FAR = "ถึงตอนนี้ทำได้ 76.2% ของเป้าทั้งเดือน (3.9 ล้านลิตร) เหลืออีก 0.93 ล้านลิตร ถึงเป้าทั้งเดือน";
const MONTH_END = "คาดการณ์: ถ้าขายเท่า 7 วันล่าสุด สิ้นเดือนจะได้ ≈ 85.9% ของเป้าทั้งเดือน";
const OWN_AGENTS = "คำถามพูดถึงของผู้ถามเอง จึงกรองเฉพาะเอเย่นต์ที่ผู้ถามดูแล 4 ราย";
const PROJECTION = { recentDays: 7, projected: "3.4 ล้านลิตร", monthTarget: "3.9 ล้านลิตร", attainment: "85.9%", attainmentToDate: "76.2%", shortBy: "0.93 ล้านลิตร", remaining: "เหลืออีก 0.93 ล้านลิตร ถึงเป้าทั้งเดือน" };

/** The rep's demo opener as query_metric answered it in round 5 (run ad24852c): one month-to-date total against target. */
const REP_OPENER = {
  ok: true,
  rows: [{ month: "2026-11", value: 2974278, value_label: "3.0 ล้านลิตร", compare_value: 3384258, delta_pct: -12.1 }],
  summary: `ปริมาณขายเข้า (Sell-in) 1 พ.ย. 2569 – 26 พ.ย. 2569: รวม 3.0 ล้านลิตร · ${PACED} -12.1% · (1 แถว · certified · SAP SD) · เดือนนี้มีข้อมูล 26 วัน (ถึง 26 พ.ย. 2569) · ${MONTH_SO_FAR} · ${MONTH_END} · ${OWN_AGENTS}`,
  headline: { aggregate: "sum", value: "3.0 ล้านลิตร", periodLabel: "1 พ.ย. 2569 – 26 พ.ย. 2569", rowCount: 1, deltaPercent: -12.1, compareLabel: PACED, compareNote: null, top: [], underLine: null, projection: PROJECTION },
  provenance: { metric: "net_sales_volume", certified: true, sourceSystem: "SAP SD", asOf: "2026-11-26", rowCount: 1, masked: [], trust: "verified" },
  query: { metric: "net_sales_volume", dims: ["month"], filters: { agent: ["ag_nea_01", "ag_nea_02", "ag_nea_03", "ag_nea_05"] }, grain: "month", compare: "target", limit: 10, range: { from: "2026-11-01", to: "2026-11-26" } },
  nextActions: [],
};

function modelReads(result: unknown): unknown {
  const view = queryMetricTool.modelView;
  if (!view) throw new Error("query_metric has no model view");
  return view(result);
}

describe("the model reads a month-to-date total against target on the card's one base (AI-180)", () => {
  test("the paced figure the card leaves out is not in what the model reads, so there is no second base to reconcile", () => {
    const read = JSON.stringify(modelReads(REP_OPENER));
    expect(read).not.toContain(PACED);
    expect(read).not.toContain("-12.1");
    expect(read).not.toContain("3384258");
  });

  test("the headline the model reads is the card's hero, the share of the whole month's target, and the summary keeps what the card does not say", () => {
    const read = modelReads(REP_OPENER) as typeof REP_OPENER & { headline: { actual?: string } };
    expect(read.headline.value).toBe("76.2% ของเป้าทั้งเดือน");
    expect(read.headline.actual).toBe("3.0 ล้านลิตร");
    expect(read.summary).toContain(MONTH_SO_FAR);
    expect(read.summary).toContain(MONTH_END);
    expect(read.summary).toContain(OWN_AGENTS);
    expect(read.summary).toContain("เดือนนี้มีข้อมูล 26 วัน");
  });

  test("the card still gets the result itself", () => {
    modelReads(REP_OPENER);
    expect(REP_OPENER.headline.deltaPercent).toBe(-12.1);
    expect(REP_OPENER.summary).toContain(PACED);
  });

  test("a result with no month-end projection, and a refusal, reach the model as they are", () => {
    const plain = { ...REP_OPENER, headline: { ...REP_OPENER.headline, projection: null } };
    expect(modelReads(plain)).toEqual(plain);
    expect(modelReads({ ok: false, code: "BAD_QUERY", error: "x" })).toEqual({ ok: false, code: "BAD_QUERY", error: "x" });
  });
});

const REGION_TOTAL = { recentDays: 7, projected: "1,777.7 ล้านบาท", monthTarget: "1,846.5 ล้านบาท", attainment: "96.3%", attainmentToDate: "83.9%", shortBy: "297.1 ล้านบาท", remaining: "ถึงวันนี้ยังขาด 297.1 ล้านบาท ถึงเป้าทั้งเดือน", endShortBy: "68.8 ล้านบาท" };

/** The CEO's "เดือนนี้ภาคไหนทำได้ต่ำกว่าเป้ามากที่สุด" as query_metric answered it in round 6 (run 89be6b01): regions against target over the month so far; the reply quoted Isan's paced −10.8% while its card row read 77.3% of the whole month's target (AI-207). */
const BY_REGION = {
  ok: true,
  rows: [
    { region: "ภาคอีสาน", value: 328402399, value_label: "328.4 ล้านบาท", compare_value: 368176591, delta_pct: -10.8 },
    { region: "ภาคเหนือ", value: 200284015, value_label: "200.3 ล้านบาท", compare_value: 203381045, delta_pct: -1.5 },
    { region: "กรุงเทพฯ และปริมณฑล", value: 380692023, value_label: "380.7 ล้านบาท", compare_value: 381479503, delta_pct: -0.2 },
  ],
  summary: `มูลค่าขายเข้า 1 พ.ย. 2569 – 26 พ.ย. 2569: รวม 1,549.4 ล้านบาท · สูงสุด: กรุงเทพฯ และปริมณฑล 380.7 ล้านบาท · ${PACED} -3.2% · (6 แถว · certified · SAP SD) · เดือนนี้มีข้อมูล 26 วัน (ถึง 26 พ.ย. 2569)`,
  headline: { aggregate: "sum", value: "1,549.4 ล้านบาท", periodLabel: "1 พ.ย. 2569 – 26 พ.ย. 2569", rowCount: 6, deltaPercent: -3.2, compareLabel: PACED, compareNote: null, top: [], underLine: null, projection: REGION_TOTAL },
  provenance: { metric: "net_sales_value", certified: true, sourceSystem: "SAP SD", asOf: "2026-11-26", rowCount: 6, masked: [], trust: "verified" },
  query: { metric: "net_sales_value", dims: ["region"], filters: {}, grain: "month", compare: "target", limit: null, sort: "delta_asc", range: { from: "2026-11-01", to: "2026-11-26" } },
  nextActions: [],
};

type ModelRead = { rows: Record<string, unknown>[]; headline: { value: string; deltaPercent: number | null; projection: Record<string, unknown> } };

describe("every month-to-date answer against target reaches the model on the card's one base, rows included (AI-207)", () => {
  test("no row carries the paced target or its gap, so the reply has no −10.8% to quote", () => {
    const read = JSON.stringify(modelReads(BY_REGION));
    expect(read).not.toContain(PACED);
    expect(read).not.toContain("-10.8");
    expect(read).not.toContain("368176591");
    expect(read).not.toContain("delta_pct");
  });

  test("each row reads its share of its whole month's target, the figure its card row prints", () => {
    const read = modelReads(BY_REGION) as ModelRead;
    expect(read.rows.map((row) => row.month_target_share)).toEqual(["77.3% ของเป้าทั้งเดือน", "85.4% ของเป้าทั้งเดือน", "86.5% ของเป้าทั้งเดือน"]);
    expect(read.rows[0]?.value_label).toBe("328.4 ล้านบาท");
    expect(read.headline.value).toBe("83.9% ของเป้าทั้งเดือน");
    expect(read.headline.deltaPercent).toBeNull();
  });
});

describe("the month end carries its own shortfall, apart from what is left from today (AI-204)", () => {
  test("the model reads the month-end share beside its shortfall at month end, and the amount left from today under its own name", () => {
    const projection = (modelReads(BY_REGION) as ModelRead).headline.projection;
    expect(projection).toMatchObject({ monthEnd: "96.3%", monthEndShortBy: "68.8 ล้านบาท", doneSoFar: "83.9%", leftFromToday: REGION_TOTAL.remaining });
    expect(projection).not.toHaveProperty("shortBy");
  });
});
