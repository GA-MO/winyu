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

/** The CEO's "ทั้งปีนี้ยอดขายจะถึงเป้าไหม" as query_metric answered it in round 7 (run 5b326258): the year so far by month against target. */
const YEAR_SO_FAR = {
  ok: true,
  rows: [
    { month: "2026-01", value: 2538658662, value_label: "2,538.7 ล้านบาท", compare_value: 2644164984, delta_pct: -4 },
    { month: "2026-02", value: 2577470555, value_label: "2,577.5 ล้านบาท", compare_value: 2683760956, delta_pct: -4 },
    { month: "2026-03", value: 3100114308, value_label: "3,100.1 ล้านบาท", compare_value: 3234503231, delta_pct: -4.2 },
    { month: "2026-04", value: 3697482183, value_label: "3,697.5 ล้านบาท", compare_value: 3720881703, delta_pct: -0.6 },
    { month: "2026-05", value: 3018787032, value_label: "3,018.8 ล้านบาท", compare_value: 3100610818, delta_pct: -2.6 },
    { month: "2026-06", value: 2765394422, value_label: "2,765.4 ล้านบาท", compare_value: 2713428881, delta_pct: 1.9 },
    { month: "2026-07", value: 2369606112, value_label: "2,369.6 ล้านบาท", compare_value: 2144295675, delta_pct: 10.5 },
    { month: "2026-08", value: 1718664416, value_label: "1,718.7 ล้านบาท", compare_value: 1749638538, delta_pct: -1.8 },
    { month: "2026-09", value: 1538211131, value_label: "1,538.2 ล้านบาท", compare_value: 1533370007, delta_pct: 0.3 },
    { month: "2026-10", value: 1490050282, value_label: "1,490.1 ล้านบาท", compare_value: 1716576153, delta_pct: -13.2 },
    { month: "2026-11", value: 1549380543, value_label: "1,549.4 ล้านบาท", compare_value: 1600280786, delta_pct: -3.2 },
  ],
  summary: "มูลค่าขายเข้า 1 ม.ค. 2569 – 26 พ.ย. 2569: รวม 26,363.8 ล้านบาท · เทียบเป้าตามเวลา -1.8% · (11 แถว · certified · SAP SD) · ข้อมูลถึง 26 พ.ย. 2569",
  headline: { aggregate: "sum", value: "26,363.8 ล้านบาท", periodLabel: "1 ม.ค. 2569 – 26 พ.ย. 2569", rowCount: 11, deltaPercent: -1.8, compareLabel: PACED, compareNote: null, top: [], underLine: null },
  provenance: { metric: "net_sales_value", certified: true, sourceSystem: "SAP SD", asOf: "2026-11-26", rowCount: 11, masked: [], trust: "verified" },
  query: { metric: "net_sales_value", dims: ["month"], filters: {}, grain: "month", compare: "target", limit: null, range: { from: "2026-01-01", to: "2026-11-26" }, period: "ytd", scopeApplied: {}, labels: {} },
  nextActions: [],
};

describe("the model reads what the rest of the year must make up (AI-251)", () => {
  test("the year so far against target tells the model the amount and the days left that the card's verdict names", () => {
    const read = JSON.stringify(modelReads(YEAR_SO_FAR));
    expect(read).toContain("477.7 ล้านบาท");
    expect(read).toContain("35 วันที่เหลือ");
  });

  test("a month to date against target gains no year line", () => {
    expect((modelReads(REP_OPENER) as typeof REP_OPENER).summary).not.toContain("ภายในสิ้นปี");
  });
});

describe("the model reads the year's yes or no with the amount and the days left (AI-275)", () => {
  test("a year behind target reads one answer line naming the amount the rest of the year must make up and the days left", () => {
    const read = modelReads(YEAR_SO_FAR) as typeof YEAR_SO_FAR & { headline: { yearEnd?: string } };
    expect(read.headline.yearEnd).toBe("ยังไม่ถึงเป้าตามเวลา จะถึงเป้าทั้งปีต่อเมื่อ 35 วันที่เหลือทำเกินเป้ารวมอีก 477.7 ล้านบาท");
  });

  test("a month to date reads no year line", () => {
    expect((modelReads(REP_OPENER) as { headline: { yearEnd?: string } }).headline.yearEnd).toBeUndefined();
  });
});

/** The CEO's ถามต่อ overdue check in round 8 (run 96e87142): the two agents asked about rose, and so did five others, one of them more. */
const OVERDUE_BY_AGENT = {
  ok: true,
  rows: [
    { agent: "ขอนแก่นมหาชัย", value: 3319236, value_label: "3.3 ล้านบาท", compare_value: 4250951, delta_pct: -21.9 },
    { agent: "โคราชสหภัณฑ์", value: 3226632, value_label: "3.2 ล้านบาท", compare_value: 2953862, delta_pct: 9.2 },
    { agent: "ส.รุ่งเรือง เทรดดิ้ง", value: 3179070, value_label: "3.2 ล้านบาท", compare_value: 3062868, delta_pct: 3.8 },
    { agent: "อุบลศรีสุข เทรดดิ้ง", value: 2933989, value_label: "2.9 ล้านบาท", compare_value: 2601749, delta_pct: 12.8 },
    { agent: "อีสานรุ่งโรจน์ ค้าส่ง", value: 2857256, value_label: "2.9 ล้านบาท", compare_value: 2324459, delta_pct: 22.9 },
    { agent: "นางรองค้าส่ง", value: 2388108, value_label: "2.4 ล้านบาท", compare_value: 2225065, delta_pct: 7.3 },
    { agent: "ปากช่องเบเวอเรจ", value: 2209668, value_label: "2.2 ล้านบาท", compare_value: 1596167, delta_pct: 38.4 },
    { agent: "วารินพาณิชย์", value: 2185816, value_label: "2.2 ล้านบาท", compare_value: 2287046, delta_pct: -4.4 },
  ],
  summary: "ยอดค้างชำระเกินกำหนด 1 พ.ย. 2569 – 26 พ.ย. 2569: รวม 22.3 ล้านบาท · เทียบช่วงก่อนหน้า +4.7% · (8 แถว · certified · SAP FI)",
  headline: { aggregate: "sum", value: "22.3 ล้านบาท", periodLabel: "1 พ.ย. 2569 – 26 พ.ย. 2569", rowCount: 8, deltaPercent: 4.7, compareLabel: "เทียบช่วงก่อนหน้า", compareNote: null, top: [], underLine: null, asked: ["อุบลศรีสุข เทรดดิ้ง", "อีสานรุ่งโรจน์ ค้าส่ง"] },
  provenance: { metric: "ar_overdue", certified: true, sourceSystem: "SAP FI", asOf: "2026-11-26", rowCount: 8, masked: [], trust: "verified" },
  query: { metric: "ar_overdue", dims: ["agent"], filters: { region: ["northeast"] }, grain: "month", compare: "prev_period", limit: null, range: { from: "2026-11-01", to: "2026-11-26" }, period: "this_month" },
  nextActions: [],
};

type AskedRead = { headline: { askedVsOthers?: string } };

describe("a check on the rows asked about reads them against every other row (AI-269)", () => {
  test("when other rows moved the same way, the model reads the one that moved most, so a rise in the asked rows is not proof", () => {
    const read = modelReads(OVERDUE_BY_AGENT) as AskedRead;
    expect(read.headline.askedVsOthers).toBe("รายที่ถาม: อุบลศรีสุข เทรดดิ้ง +12.8%, อีสานรุ่งโรจน์ ค้าส่ง +22.9% · รายอื่นเพิ่มขึ้นด้วย 4 ราย มากสุด ปากช่องเบเวอเรจ +38.4% ข้อมูลนี้จึงไม่ได้แยกรายที่ถามออกจากรายอื่น");
  });

  test("when no other row moved as far, the model reads that, still as a lead and not a cause", () => {
    const rows = OVERDUE_BY_AGENT.rows.map((row) => (row.agent === "ปากช่องเบเวอเรจ" ? { ...row, delta_pct: 5.1 } : row));
    const read = modelReads({ ...OVERDUE_BY_AGENT, rows }) as AskedRead;
    expect(read.headline.askedVsOthers).toBe("รายที่ถาม: อุบลศรีสุข เทรดดิ้ง +12.8%, อีสานรุ่งโรจน์ ค้าส่ง +22.9% · รายอื่นเพิ่มขึ้นด้วย 4 ราย แต่ไม่มีรายใดเพิ่มขึ้นมากเท่ารายที่ถาม");
  });

  test("a result that names no rows reads as it was", () => {
    const { asked: _asked, ...headline } = OVERDUE_BY_AGENT.headline;
    expect((modelReads({ ...OVERDUE_BY_AGENT, headline }) as AskedRead).headline.askedVsOthers).toBeUndefined();
  });
});
