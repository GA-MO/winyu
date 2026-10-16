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

  test("a result split into groups, and one with no month-end projection, reach the model as they are", () => {
    const split = { ...REP_OPENER, rows: [REP_OPENER.rows[0], { ...REP_OPENER.rows[0], month: "2026-10" }] };
    const plain = { ...REP_OPENER, headline: { ...REP_OPENER.headline, projection: null } };
    expect(modelReads(split)).toEqual(split);
    expect(modelReads(plain)).toEqual(plain);
    expect(modelReads({ ok: false, code: "BAD_QUERY", error: "x" })).toEqual({ ok: false, code: "BAD_QUERY", error: "x" });
  });
});
