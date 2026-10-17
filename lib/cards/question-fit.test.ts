import { describe, expect, test } from "bun:test";
import { widgetKindSchema, type AlertRow, type MetricHeadline, type MetricQuery, type MetricResult, type MetricRow } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { runMetric } from "@/lib/data/query";
import { DATA_AS_OF, monthStart } from "@/lib/data/dates";
import { templateFor } from "@/lib/dashboard/templates";
import { TH } from "@/lib/i18n/th";
import { presentAlerts, presentCard, presentGap, widgetKindFor, type CardBody, type CardParts, type GapAnswer } from "./present";
import type { Strip } from "./reading";

const AS_OF = "2026-11-26";
const NOVEMBER = { from: "2026-11-01", to: AS_OF };
const OCTOBER = { from: "2026-10-01", to: "2026-10-31" };
const CEO = accessFor(findUser("u_thana")!);

function resultOf(query: MetricQuery, rows: MetricRow[], headline: Partial<MetricHeadline> & Pick<MetricHeadline, "value">, filterLabels: string[] = []): MetricResult {
  return {
    ok: true,
    rows,
    summary: "",
    headline: { aggregate: "sum", periodLabel: "", rowCount: rows.length, deltaPercent: null, compareLabel: null, compareNote: null, top: [], underLine: null, ...headline },
    provenance: { metric: query.metric, certified: true, sourceSystem: "SAP SD", asOf: AS_OF, rowCount: rows.length, filterLabels, masked: [], trust: "verified" },
    query: { ...query, scopeApplied: {}, labels: {} },
  };
}

function stripOf(body: CardBody): Strip {
  if (body.kind !== "strip" && body.kind !== "exceptions") throw new Error(`no strip: ${body.kind}`);
  return body.strip;
}

function valuedLabels(card: CardParts): string[] {
  return stripOf(card.body).rows.filter((row) => row.valued).map((row) => row.label);
}

const WEEK_BY_REGION: MetricQuery = { metric: "net_sales_value", dims: ["region"], filters: {}, range: { from: "2026-11-23", to: AS_OF }, grain: "week", compare: "prev_period", limit: null, sort: "delta_asc" };
const WEEK_ROWS: MetricRow[] = [
  { region: "ภาคอีสาน", value: 47204061, value_label: "47.2 ล้านบาท", compare_value: 53051003, delta_pct: -11 },
  { region: "ภาคเหนือ", value: 32716414, value_label: "32.7 ล้านบาท", compare_value: 36173430, delta_pct: -9.6 },
  { region: "ภาคตะวันออก", value: 37220018, value_label: "37.2 ล้านบาท", compare_value: 41137695, delta_pct: -9.5 },
  { region: "ภาคใต้", value: 33101875, value_label: "33.1 ล้านบาท", compare_value: 36491440, delta_pct: -9.3 },
  { region: "กรุงเทพฯ และปริมณฑล", value: 62880808, value_label: "62.9 ล้านบาท", compare_value: 68740751, delta_pct: -8.5 },
  { region: "ภาคกลาง", value: 34977610, value_label: "35.0 ล้านบาท", compare_value: 38025084, delta_pct: -8 },
];

const SHARE_BY_REGION: MetricQuery = { metric: "market_share", dims: ["region"], filters: { maker: ["mk_boonrawd"] }, range: OCTOBER, grain: "month", compare: "prev_period", limit: null, sort: "delta_asc" };
const SHARE_REGION_ROWS: MetricRow[] = [
  { region: "ภาคอีสาน", value: 62.7, value_label: "62.7%", compare_value: 63, delta_pct: -0.5, delta_pt: -0.3 },
  { region: "ภาคใต้", value: 58.8, value_label: "58.8%", compare_value: 58.9, delta_pct: -0.2, delta_pt: -0.1 },
  { region: "ภาคเหนือ", value: 62.1, value_label: "62.1%", compare_value: 62.1, delta_pct: 0.1, delta_pt: 0.1 },
  { region: "ภาคกลาง", value: 54.7, value_label: "54.7%", compare_value: 54.5, delta_pct: 0.3, delta_pt: 0.2 },
  { region: "ภาคตะวันออก", value: 58.5, value_label: "58.5%", compare_value: 58.2, delta_pct: 0.5, delta_pt: 0.3 },
  { region: "กรุงเทพฯ และปริมณฑล", value: 58.1, value_label: "58.1%", compare_value: 57.8, delta_pct: 0.5, delta_pt: 0.3 },
];

describe("a change strip values the row that answers (AI-173)", () => {
  test("asked why sales fell this week, the region that fell most carries its value, not only the last row", () => {
    const card = presentCard({ title: "t", query: WEEK_BY_REGION, result: resultOf(WEEK_BY_REGION, WEEK_ROWS, { value: "248.1 ล้านบาท", deltaPercent: -9.3, compareLabel: "เทียบช่วงก่อนหน้า" }) });
    expect(valuedLabels(card)).toContain("ภาคอีสาน");
  });

  test("asked which region lost share, the region that lost most carries its points", () => {
    const result = resultOf(SHARE_BY_REGION, SHARE_REGION_ROWS, { aggregate: "average", value: "59.3%", deltaPercent: 0.1, deltaPoints: 0.1, compareLabel: "เทียบช่วงก่อนหน้า" }, ["บุญรอดบริวเวอรี่"]);
    const card = presentCard({ title: "t", query: SHARE_BY_REGION, result });
    expect(valuedLabels(card)).toContain("ภาคอีสาน");
  });
});

const BOARD_QUERY: MetricQuery = { metric: "net_sales_value", dims: ["business_unit"], filters: {}, range: NOVEMBER, grain: "month", compare: "target", limit: null };
const BOARD_ROWS: MetricRow[] = [
  { business_unit: "กลุ่มเบียร์", value: 1296387401, value_label: "1,296.4 ล้านบาท", compare_value: 1350405697, delta_pct: -4 },
  { business_unit: "กลุ่มนอนแอลกอฮอล์", value: 158078878, value_label: "158.1 ล้านบาท", compare_value: 155836642, delta_pct: 1.4 },
  { business_unit: "กลุ่มนำเข้า", value: 94914264, value_label: "94.9 ล้านบาท", compare_value: 94038447, delta_pct: 0.9 },
];
const PROJECTION = { recentDays: 7, projected: "1,777.7 ล้านบาท", monthTarget: "1,846.5 ล้านบาท", attainment: "96.3%", attainmentToDate: "83.9%", shortBy: "297.1 ล้านบาท", remaining: "เหลืออีก 297.1 ล้านบาท ถึงเป้าทั้งเดือน" };
const BOARD_RESULT = resultOf(BOARD_QUERY, BOARD_ROWS, { value: "1,549.4 ล้านบาท", deltaPercent: -3.2, compareLabel: "เทียบเป้าตามเวลา", projection: PROJECTION });
const MARGIN_QUERY: MetricQuery = { metric: "gross_margin", dims: ["business_unit"], filters: {}, range: NOVEMBER, grain: "month", compare: "prev_period", limit: null };
const MARGIN_RESULT = resultOf(MARGIN_QUERY, [
  { business_unit: "กลุ่มนอนแอลกอฮอล์", value: 42.3, value_label: "42.3%", compare_value: 40.8, delta_pct: 3.6, delta_pt: 1.5 },
  { business_unit: "กลุ่มเบียร์", value: 25.7, value_label: "25.7%", compare_value: 24.7, delta_pct: 3.9, delta_pt: 1 },
  { business_unit: "กลุ่มนำเข้า", value: 24.7, value_label: "24.7%", compare_value: 24.1, delta_pct: 2.5, delta_pt: 0.6 },
], { aggregate: "average", value: "27.3%", deltaPercent: 2.8, deltaPoints: 0.8, compareLabel: "เทียบช่วงก่อนหน้า" });

describe("the board summary card (AI-188)", () => {
  const card = presentCard({ title: "t", query: BOARD_QUERY, result: BOARD_RESULT, others: [{ query: MARGIN_QUERY, result: MARGIN_RESULT }] });

  test("with three rows every row carries its value", () => {
    expect(valuedLabels(card)).toEqual(stripOf(card.body).rows.map((row) => row.label));
  });

  test("the overall line keeps the margin it was asked for whole, without a comparison word the rows do not repeat", () => {
    const overall = stripOf(card.body).overall?.sub ?? "";
    expect(overall).toContain("อัตรากำไรขั้นต้น 27.3% +0.8 จุด");
    expect(overall).not.toContain("เทียบช่วงก่อนหน้า");
  });
});

const YTD_QUERY: MetricQuery = { metric: "net_sales_value", dims: ["month"], filters: {}, range: { from: "2026-01-01", to: AS_OF }, grain: "month", compare: "target", limit: 12, sort: "value_desc" };
const YTD_ROWS: MetricRow[] = [
  ["2026-01", 2538658662, 2644164984, -4], ["2026-02", 2577470555, 2683760956, -4], ["2026-03", 3100114308, 3234503231, -4.2], ["2026-04", 3697482183, 3720881703, -0.6],
  ["2026-05", 3018787032, 3100610818, -2.6], ["2026-06", 2765394422, 2713428881, 1.9], ["2026-07", 2369606112, 2144295675, 10.5], ["2026-08", 1718664416, 1749638538, -1.8],
  ["2026-09", 1538211131, 1533370007, 0.3], ["2026-10", 1490050282, 1716576153, -13.2], ["2026-11", 1549380543, 1600280786, -3.2],
].map(([month, value, target, delta]) => ({ month, value, compare_value: target, delta_pct: delta }));
const YTD_RESULT = resultOf(YTD_QUERY, YTD_ROWS, { value: "26,363.8 ล้านบาท", periodLabel: "1 ม.ค. 2569 – 26 พ.ย. 2569", deltaPercent: -1.8, compareLabel: "เทียบเป้าตามเวลา" });

describe("a series against its target leads with the whole range against target (AI-174)", () => {
  const card = presentCard({ title: "t", query: YTD_QUERY, result: YTD_RESULT });

  test("asked whether the year reaches target, the hero is the year to date against target, never October against September", () => {
    expect(card.hero).toMatchObject({ value: "98.2%", unit: TH.read.ofPacedTarget, tone: "bad" });
    expect(card.verdict).not.toContain("จาก ก.ย. 69");
  });

  test("what is left to target and the month that missed most are on the card", () => {
    const tiles = card.tiles.map((tile) => `${tile.label} ${tile.value}`);
    expect(tiles).toContain(`${TH.read.leftToDate} 477.7 ล้านบาท`);
    expect(card.verdict).toContain("ต.ค. 69");
  });
});

const DAYS = Array.from({ length: 30 }, (_, index) => new Date(Date.UTC(2026, 9, 28 + index)).toISOString().slice(0, 10));
const DAILY_LITRES = [28448, 29437, 33345, 20483, 8477, 29524, 28444, 27654, 28284, 33538, 20921, 9027, 30123, 29765, 28910, 29255, 34544, 21693, 3335, 11160, 10363, 10053, 10656, 12850, 7865, 3496, 10863, 5507, 10510, 10755];
const DAILY_QUERY: MetricQuery = { metric: "net_sales_volume", dims: ["date"], filters: { agent: ["ag_nea_02"] }, range: { from: "2026-10-28", to: AS_OF }, grain: "day", compare: "none", limit: 30 };
const DAILY_RESULT = resultOf(DAILY_QUERY, DAILY_LITRES.map((value, index) => ({ date: DAYS[index], value })), { value: "579,284 ลิตร", periodLabel: "28 ต.ค. 2569 – 26 พ.ย. 2569" }, ["อีสานรุ่งโรจน์ ค้าส่ง"]);

describe("a series with a step leads with the step (AI-174)", () => {
  const card = presentCard({ title: "t", query: DAILY_QUERY, result: DAILY_RESULT });

  test("the rep's daily sell-in that fell from about 26,000 to about 9,000 litres a day on 15 Nov leads with when, from and to, in red", () => {
    expect(card.hero?.label).toContain("15 พ.ย.");
    expect(card.hero?.tone).toBe("bad");
    expect(card.verdict).toContain("15 พ.ย.");
    expect(card.verdict).toContain("26,215 ลิตร");
    expect(card.verdict).toContain("8,951 ลิตร");
  });

  test("a series without a step still reads its latest bucket", () => {
    const steady = resultOf(DAILY_QUERY, DAILY_LITRES.slice(0, 18).map((value, index) => ({ date: DAYS[index], value })), { value: "490,000 ลิตร" });
    const latest = presentCard({ title: "t", query: { ...DAILY_QUERY, range: { from: DAYS[0], to: DAYS[17] } }, result: steady });
    expect(latest.hero?.label).toBe("14 พ.ย.");
  });
});

describe("a month-end projection is a card of its own and a widget kind (AI-171)", () => {
  test("drawn as month_end, the company card leads with where the month ends, the share done so far beside it", () => {
    const card = presentCard({ title: "t", query: BOARD_QUERY, result: BOARD_RESULT, view: "month_end" });
    expect(card.hero).toMatchObject({ label: TH.cards.gap.monthEndLabel, value: "96.3%", unit: TH.read.ofMonthTarget, tone: "bad" });
    expect(card.tiles.map((tile) => tile.value)).toContain("83.9%");
  });

  test("a widget may be pinned as month_end", () => {
    expect(widgetKindSchema.safeParse("month_end").success).toBe(true);
  });
});

const CLOSE_QUERY: MetricQuery = { metric: "net_sales_value", dims: ["month"], filters: {}, range: NOVEMBER, grain: "month", compare: "target", limit: null, period: "this_month" };
const CLOSE_PROJECTION = { ...PROJECTION, endShortBy: "68.8 ล้านบาท", remaining: "ถึงวันนี้ยังขาด 297.1 ล้านบาท ถึงเป้าทั้งเดือน" };
const CLOSE_ROWS: MetricRow[] = [{ month: "2026-11", value: 1549380543, value_label: "1,549.4 ล้านบาท", compare_value: 1600280786, delta_pct: -3.2 }];

describe("asked where the month closes, the chat card is the month-end card (R14, AI-236)", () => {
  const headline = { value: "1,549.4 ล้านบาท", deltaPercent: -3.2, compareLabel: "เทียบเป้าตามเวลา", projection: CLOSE_PROJECTION };
  const asked = resultOf(CLOSE_QUERY, CLOSE_ROWS, { ...headline, asksMonthEnd: true });

  test("round 7's company month close leads with 96.3% at month end and its 68.8 ล้านบาท shortfall, the 83.9% so far beside it, as the pinned card does", () => {
    const chat = presentCard({ title: "t", query: CLOSE_QUERY, result: asked });
    const pinned = presentCard({ title: "t", query: CLOSE_QUERY, result: asked, view: "month_end" });
    expect(chat.hero).toMatchObject({ label: TH.cards.gap.monthEndLabel, value: "96.3%", unit: TH.read.ofMonthTarget, tone: "bad" });
    expect(chat.verdict).toBe(TH.cards.gap.monthEnd(false));
    expect(chat.tiles.map((tile) => tile.value)).toEqual(["83.9%", "68.8 ล้านบาท"]);
    expect(chat.hero).toEqual(pinned.hero);
    expect(widgetKindFor(CLOSE_QUERY, asked)).toBe("month_end");
  });

  test("the same answer to a question about the month so far keeps leading with the share done so far", () => {
    const soFar = presentCard({ title: "t", query: CLOSE_QUERY, result: resultOf(CLOSE_QUERY, CLOSE_ROWS, headline) });
    expect(soFar.hero?.value).toBe("83.9%");
  });

  test("a breakdown asked where the month closes keeps its rows", () => {
    const byUnit = presentCard({ title: "t", query: BOARD_QUERY, result: resultOf(BOARD_QUERY, BOARD_ROWS, { value: "1,549.4 ล้านบาท", deltaPercent: -3.2, compareLabel: "เทียบเป้าตามเวลา", projection: PROJECTION, asksMonthEnd: true }) });
    expect(byUnit.body.kind).toBe("strip");
  });
});

describe("a month-close gap card names the base of each figure (AI-185)", () => {
  const answer: GapAnswer = {
    period_label: "1 พ.ย. 2569 – 26 พ.ย. 2569",
    actual_label: "328.4 ล้านบาท",
    compare_label: "เป้า 368.2 ล้านบาท",
    gap_label: "−39.8 ล้านบาท",
    attainment_label: "89.2%",
    contributors: [{ label: "อีสานรุ่งโรจน์ ค้าส่ง", gap_label: "−18.1 ล้านบาท", share_label: "45.4%" }],
    rest: null,
    offsetting: [],
    projection: { basis: "", projected_label: "371.9 ล้านบาท", month_target_label: "424.8 ล้านบาท", attainment_label: "87.5%" },
  };

  test("under a month-end hero, the gap row says it is the gap to date", () => {
    const card = presentGap({ answer, metric: "net_sales_value", split: "agent" });
    expect(stripOf(card.body).rows[0].label).toContain(TH.cards.gap.toDate);
  });
});

describe("the CEO's company tile is the chat's company figure (AI-187)", () => {
  test("the template's tile against target is the same share the chat draws for the company this month", () => {
    const tile = templateFor(CEO).find((seed) => seed.key === "attainment");
    if (!tile) throw new Error("no attainment tile");
    const chat: MetricQuery = { metric: "net_sales_value", dims: [], filters: {}, range: { from: monthStart(DATA_AS_OF), to: DATA_AS_OF }, grain: "month", compare: "target", limit: null };
    const tileHero = presentCard({ title: tile.title, query: tile.query, result: runMetric(tile.query, CEO), view: tile.kind }).hero;
    const chatHero = presentCard({ title: "t", query: chat, result: runMetric(chat, CEO) }).hero;
    expect(tileHero?.value).toBe(chatHero?.value);
    expect(tileHero?.unit).toBe(chatHero?.unit);
  });
});

describe("our own market share is named as ours (AI-189)", () => {
  test("the share donut by maker labels its headline as our share, not an average of every maker", () => {
    const query: MetricQuery = { metric: "market_share", dims: ["maker"], filters: {}, range: OCTOBER, grain: "month", compare: "prev_period", limit: 10 };
    const result = resultOf(query, [
      { maker: "บุญรอดบริวเวอรี่", value: 59.3, value_label: "59.3%", compare_value: 59.2, delta_pct: 0.1, delta_pt: 0.1 },
      { maker: "ไทยเบฟเวอเรจ", value: 30.5, value_label: "30.5%", compare_value: 30.5, delta_pct: -0.2, delta_pt: -0.1 },
      { maker: "คาราบาว", value: 6.8, value_label: "6.8%", compare_value: 6.7, delta_pct: 1.3, delta_pt: 0.1 },
      { maker: "รายอื่น", value: 3.5, value_label: "3.5%", compare_value: 3.6, delta_pct: -2.6, delta_pt: -0.1 },
    ], { aggregate: "average", value: "59.3%", deltaPercent: 0.1, deltaPoints: 0.1, compareLabel: "เทียบช่วงก่อนหน้า" });
    const card = presentCard({ title: "t", query, result });
    expect(card.hero?.label).toBe(TH.read.ownShare);
  });
});

const ISAN_QUERY: MetricQuery = { metric: "net_sales_value", dims: ["region"], filters: { region: ["northeast"] }, range: NOVEMBER, grain: "month", compare: "target", limit: null };
const ISAN_PROJECTION = { recentDays: 7, projected: "371.9 ล้านบาท", monthTarget: "424.8 ล้านบาท", attainment: "87.5%", attainmentToDate: "77.3%", shortBy: "96.4 ล้านบาท", endShortBy: "52.9 ล้านบาท", remaining: "เหลืออีก 96.4 ล้านบาท ถึงเป้าทั้งเดือน" };
const ISAN_RESULT = resultOf(ISAN_QUERY, [{ region: "ภาคอีสาน", value: 328402399, value_label: "328.4 ล้านบาท", compare_value: 368176591, delta_pct: -10.8 }], { value: "328.4 ล้านบาท", deltaPercent: -10.8, compareLabel: "เทียบเป้าตามเวลา", projection: ISAN_PROJECTION }, ["ภาคอีสาน"]);

describe("every month-end tile says what it is (AI-204)", () => {
  test("the Isan scorecard's 96.4 is the shortfall to date toward the whole month's target, never a share of it", () => {
    const card = presentCard({ title: "t", query: ISAN_QUERY, result: ISAN_RESULT });
    expect(card.tiles.find((tile) => tile.value === "96.4 ล้านบาท")).toMatchObject({ label: TH.read.leftToDate, sub: TH.read.toMonthTarget });
    expect(card.tiles.find((tile) => tile.value === "87.5%")?.sub).toBe(TH.read.ofMonthTarget);
  });

  test("the pinned month_end card sets the month-end shortfall beside the month-end share, never the shortfall to date", () => {
    const card = presentCard({ title: "t", query: ISAN_QUERY, result: ISAN_RESULT, view: "month_end" });
    expect(card.hero?.value).toBe("87.5%");
    expect(card.tiles.find((tile) => tile.value === "52.9 ล้านบาท")).toMatchObject({ label: TH.read.endShort, sub: TH.read.atMonthEnd });
    expect(card.tiles.map((tile) => tile.value)).not.toContain("96.4 ล้านบาท");
  });
});

const OVERDUE_QUERY: MetricQuery = { metric: "ar_overdue", dims: ["month"], filters: { agent: ["ag_nea_02"] }, range: { from: "2026-06-01", to: AS_OF }, grain: "month", compare: "none", limit: null };
const OVERDUE_ROWS: MetricRow[] = [["2026-06", 4457401], ["2026-07", 5464459], ["2026-08", 3688243], ["2026-09", 3199064], ["2026-10", 2324459], ["2026-11", 2857256]].map(([month, value]) => ({ month, value }));
const OVERDUE_RESULT = resultOf(OVERDUE_QUERY, OVERDUE_ROWS, { value: "2.9 ล้านบาท", periodLabel: "1 มิ.ย. 2569 – 26 พ.ย. 2569" }, ["อีสานรุ่งโรจน์ ค้าส่ง", "ภาคอีสาน"]);

describe("a balance keeps the month still running (AI-206)", () => {
  const card = presentCard({ title: "t", query: OVERDUE_QUERY, result: OVERDUE_RESULT });

  test("overdue money by month ends at November and leads with November's rise in red, not October's fall in green", () => {
    expect(card.hero).toMatchObject({ label: "พ.ย. 69", trend: "up", tone: "bad" });
    if (card.body.kind !== "line") throw new Error(`no line: ${card.body.kind}`);
    expect(card.body.labels[card.body.labels.length - 1]).toBe("พ.ย. 69");
  });

  test("the balance is never labelled as a total of the range", () => {
    expect(card.tiles.map((tile) => tile.label)).not.toContain(TH.read.wholeRange);
  });
});

const YEAR_QUERY: MetricQuery = { metric: "net_sales_value", dims: [], filters: {}, range: { from: "2026-01-01", to: AS_OF }, grain: "month", compare: "target", limit: null };
const YEAR_RESULT = resultOf(YEAR_QUERY, [{ value: 26363819646, value_label: "26,363.8 ล้านบาท", compare_value: 26841511732, delta_pct: -1.8 }], { value: "26,363.8 ล้านบาท", periodLabel: "1 ม.ค. 2569 – 26 พ.ย. 2569", deltaPercent: -1.8, compareLabel: "เทียบเป้าตามเวลา" });

describe("a year against its target says where the year stands and what is left (AI-213)", () => {
  test("asked whether the year reaches target, the card leads with the year to date against target, the amount behind and the days left in the year", () => {
    const card = presentCard({ title: "t", query: YEAR_QUERY, result: YEAR_RESULT });
    expect(card.hero).toMatchObject({ label: TH.read.yearToDate, value: "98.2%", unit: TH.read.ofPacedTarget, tone: "bad" });
    expect(card.tiles.find((tile) => tile.value === "477.7 ล้านบาท")?.label).toBe(TH.read.leftToDate);
    expect(card.tiles.map((tile) => tile.value)).toContain(TH.read.daysLeft(35));
    expect(card.verdict).toContain("477.7 ล้านบาท");
    expect(card.verdict).toContain(TH.read.daysLeft(35));
  });

  test("the year by month also says what is left in the days left of the year", () => {
    const card = presentCard({ title: "t", query: YTD_QUERY, result: YTD_RESULT });
    expect(card.verdict).toContain(TH.read.daysLeft(35));
    expect(card.verdict).toContain("ต.ค. 69");
  });
});

const GAP_ANSWER: GapAnswer = {
  period_label: "1 พ.ย. 2569 – 26 พ.ย. 2569",
  actual_label: "467,572 ลิตร",
  compare_label: "เป้า 674,882 ลิตร",
  gap_label: "−207,310 ลิตร",
  attainment_label: "69.3%",
  contributors: [{ label: "ลีโอ", gap_label: "−133,008 ลิตร", share_label: "64.2%" }, { label: "สิงห์", gap_label: "−75,743 ลิตร", share_label: "36.5%" }, { label: "โซดาสิงห์", gap_label: "−950 ลิตร", share_label: "0.5%" }],
  rest: null,
  offsetting: [{ label: "น้ำดื่มสิงห์", gap_label: "+1,208 ลิตร" }],
  projection: { basis: "", projected_label: "502,913 ลิตร", month_target_label: "778,710 ลิตร", attainment_label: "64.6%" },
};

describe("a gap card never sets two near-equal percentages of different things together (AI-222)", () => {
  test("the part that pulled furthest is named by its amount, so 64.2% of the gap never sits over the 64.6% month-end hero", () => {
    const card = presentGap({ answer: GAP_ANSWER, metric: "net_sales_volume", split: "brand" });
    expect(card.hero?.value).toBe("64.6%");
    expect(card.verdict).toContain("133,008 ลิตร");
    expect(card.verdict).not.toContain("64.2%");
  });
});

const WEEK_QUERY: MetricQuery = { metric: "net_sales_value", dims: [], filters: {}, range: { from: "2026-11-23", to: AS_OF }, grain: "week", compare: "prev_period", limit: null };
const WEEK_RESULT = resultOf(WEEK_QUERY, [{ value: 248100786, value_label: "248.1 ล้านบาท", compare_value: 273619404, delta_pct: -9.3 }], { value: "248.1 ล้านบาท", periodLabel: "23 พ.ย. 2569 – 26 พ.ย. 2569", deltaPercent: -9.3, compareLabel: "เทียบช่วงก่อนหน้า" });
const MONTH_MARGIN_QUERY: MetricQuery = { metric: "gross_margin", dims: [], filters: {}, range: NOVEMBER, grain: "month", compare: "prev_period", limit: null };
const MONTH_MARGIN_RESULT = resultOf(MONTH_MARGIN_QUERY, [{ value: 27.3, value_label: "27.3%", compare_value: 26.6, delta_pct: 2.8, delta_pt: 0.8 }], { aggregate: "average", value: "27.3%", periodLabel: "1 พ.ย. 2569 – 26 พ.ย. 2569", deltaPercent: 2.8, deltaPoints: 0.8, compareLabel: "เทียบช่วงก่อนหน้า" });

describe("a one-number change names both periods (AI-223)", () => {
  test("this week against last week reads as the days of this week and สัปดาห์ก่อน, never ช่วงนี้ and งวดก่อน", () => {
    const card = presentCard({ title: "t", query: WEEK_QUERY, result: WEEK_RESULT });
    expect(card.hero?.label).toBe("23–26 พ.ย. 2569");
    expect(card.tiles.map((tile) => tile.label)).toContain(TH.read.lastWeek);
    expect(card.verdict).toContain(TH.read.lastWeek);
  });

  test("this month's margin against last month names November and October", () => {
    const card = presentCard({ title: "t", query: MONTH_MARGIN_QUERY, result: MONTH_MARGIN_RESULT });
    expect(card.hero?.label).toBe("พ.ย. 69");
    expect(card.tiles.map((tile) => tile.label)).toContain("ต.ค. 69");
    expect(card.verdict).toContain("ต.ค. 69");
  });
});

const FALL_QUERY: MetricQuery = { metric: "net_sales_value", dims: ["agent"], filters: { agent: ["ag_nea_01", "ag_nea_02", "ag_nea_03", "ag_nea_05"] }, range: NOVEMBER, grain: "month", compare: "prev_period", limit: 4, sort: "delta_asc" };
const FALL_RESULT = resultOf(FALL_QUERY, [
  { agent: "อีสานรุ่งโรจน์ ค้าส่ง", value: 26792888, value_label: "26.8 ล้านบาท", compare_value: 32297916, delta_pct: -17 },
  { agent: "อุบลศรีสุข เทรดดิ้ง", value: 25626214, value_label: "25.6 ล้านบาท", compare_value: 30458847, delta_pct: -15.9 },
  { agent: "ขอนแก่นมหาชัย", value: 70967921, value_label: "71.0 ล้านบาท", compare_value: 52318619, delta_pct: 35.6 },
  { agent: "โคราชสหภัณฑ์", value: 65966163, value_label: "66.0 ล้านบาท", compare_value: 47962151, delta_pct: 37.5 },
], { value: "189.4 ล้านบาท", deltaPercent: 16.1, compareLabel: "เทียบช่วงก่อนหน้า" }, ["ภาคอีสาน"]);
const PACE_QUERY: MetricQuery = { metric: "target_attainment", dims: ["brand"], filters: { region: ["northeast"] }, range: NOVEMBER, grain: "month", compare: "none", limit: null };
const PACE_ROWS: [string, number][] = [["ลีโอ", 87.4], ["สิงห์", 88.6], ["โซดาสิงห์", 98.9], ["คาร์ลสเบิร์ก", 100.5], ["สิงห์ เลมอนโซดา", 100.7], ["อาซาฮี", 101.4], ["น้ำดื่มสิงห์", 101.8], ["เพอร์ร่า", 102.3]];
const PACE_RESULT = resultOf(PACE_QUERY, PACE_ROWS.map(([brand, value]) => ({ brand, value, value_label: `${value}%` })), { aggregate: "average", value: "92.0%" }, ["ภาคอีสาน"]);

describe("a strip never leaves a row that matters unlabelled (AI-228)", () => {
  test("an agent that rose almost as much as the top one carries its change", () => {
    const card = presentCard({ title: "t", query: FALL_QUERY, result: FALL_RESULT });
    expect(valuedLabels(card)).toContain("ขอนแก่นมหาชัย");
  });

  test("a brand just over the pace line, whose bar is too short to see, carries its value", () => {
    const card = presentCard({ title: "t", query: PACE_QUERY, result: PACE_RESULT });
    expect(valuedLabels(card)).toEqual(expect.arrayContaining(["คาร์ลสเบิร์ก", "สิงห์ เลมอนโซดา", "อาซาฮี", "น้ำดื่มสิงห์"]));
  });
});

const COVER_QUERY: MetricQuery = { metric: "days_of_cover", dims: ["dc"], filters: {}, range: NOVEMBER, grain: "month", compare: "none", limit: null, sort: "value_desc" };
const COVER_ROWS: [string, number][] = [["ศูนย์กระจายสินค้าชลบุรี", 15.46], ["ศูนย์กระจายสินค้ากรุงเทพฯ", 14.29], ["ศูนย์กระจายสินค้าลำพูน", 13.24]];
const COVER_RESULT = resultOf(COVER_QUERY, COVER_ROWS.map(([dc, value]) => ({ dc, value, value_label: `${value} วัน` })), { aggregate: "average", value: "14.4 วัน", underLine: { line: 10, count: 0, of: 3 } });

function alertOf(id: string, severity: "P1" | "P3", metric: MetricQuery["metric"], direction: "up" | "down"): AlertRow {
  return { id, severity, severityLabel: severity, metric, metricLabel: metric, scope: {}, scopeLabel: id, window: "", observedLabel: "", expectedLabel: "", gapLabel: "40%", yearOverYear: false, direction, hypothesis: id, ownerUserId: "u_wee" };
}

describe("a risk answer never calms over a stock-out it cannot see (AI-221)", () => {
  test("cover averaged over every product of a DC says it is an average, never that the DC is clear", () => {
    const card = presentCard({ title: "t", query: COVER_QUERY, result: COVER_RESULT });
    expect(card.verdict).toContain(TH.read.cover.averaged);
    expect(card.verdict).not.toContain("ยังเกิน");
  });

  test("a list of alerts shows what hurts; rises that do no harm are folded behind it", () => {
    const card = presentAlerts({ title: "t", alerts: [alertOf("soda", "P3", "sell_out_volume", "up"), alertOf("cover", "P1", "days_of_cover", "down"), alertOf("ar", "P1", "ar_overdue", "up"), alertOf("leo", "P3", "net_sales_volume", "down")] });
    if (card.body.kind !== "alerts") throw new Error(card.body.kind);
    expect(card.body.items.map((item) => item.id)).toEqual(["cover", "ar", "leo"]);
    expect(card.body.more.map((item) => item.id)).toEqual(["soda"]);
  });
});

const REP_TILE_QUERY: MetricQuery = { metric: "net_sales_volume", dims: [], filters: { region: ["northeast"], agent: ["ag_nea_01", "ag_nea_02", "ag_nea_03", "ag_nea_05"] }, range: NOVEMBER, grain: "month", compare: "target", limit: null };

describe("the rep's starter card is short and on the month base (AI-231)", () => {
  test("a card over four agents names them as four agents, never five names joined", () => {
    const result = resultOf(REP_TILE_QUERY, [{ value: 2974278, value_label: "3.0 ล้านลิตร", compare_value: 3384258, delta_pct: -12.1 }], { value: "3.0 ล้านลิตร", deltaPercent: -12.1, compareLabel: "เทียบเป้าตามเวลา" }, ["ขอนแก่นมหาชัย", "อีสานรุ่งโรจน์ ค้าส่ง", "โคราชสหภัณฑ์", "อุบลศรีสุข เทรดดิ้ง", "ภาคอีสาน"]);
    const card = presentCard({ title: "t", query: REP_TILE_QUERY, result });
    expect(card.verdict).toContain(`4 ${TH.dash.dimUnit.agent}`);
    expect(card.verdict).not.toContain("ขอนแก่นมหาชัย");
  });

  test("the rep's template tile asks the same question as the chat's month card, so it reads on the month's base", () => {
    const rep = findUser("u_krit");
    if (!rep) throw new Error("no rep");
    const tile = templateFor(accessFor(rep)).find((seed) => seed.key === "attainment");
    expect(tile?.query).toMatchObject({ metric: "net_sales_value", compare: "target" });
  });
});

const TWO_AGENTS: MetricQuery = { metric: "net_sales_value", dims: ["agent"], filters: { agent: ["ag_nea_02", "ag_nea_05"] }, range: NOVEMBER, grain: "day", compare: "target", limit: null, sort: "delta_asc" };
const REP_AGENTS: MetricQuery = { metric: "net_sales_value", dims: ["agent"], filters: { agent: ["ag_nea_01", "ag_nea_02", "ag_nea_03", "ag_nea_05"] }, range: NOVEMBER, grain: "month", compare: "target", limit: null };
const REGION_AGENTS: MetricQuery = { metric: "net_sales_value", dims: ["agent"], filters: { region: ["northeast"] }, range: NOVEMBER, grain: "month", compare: "target", limit: null, sort: "delta_asc" };
const TWO_AGENTS_OVERDUE: MetricQuery = { metric: "ar_overdue", dims: ["agent"], filters: { agent: ["ag_nea_02", "ag_nea_05"] }, range: NOVEMBER, grain: "month", compare: "prev_period", limit: null };

function overallOf(query: MetricQuery): { label: string; verdict: string | null } {
  const card = presentCard({ title: "t", query, result: runMetric(query, CEO) });
  return { label: stripOf(card.body).overall?.label ?? "", verdict: card.verdict };
}

describe("an overall row over a subset names the subset (AI-238)", () => {
  test("the CEO's Isan story card over two agents reads รวม 2 เอเย่นต์, and its verdict speaks for those two", () => {
    expect(overallOf(TWO_AGENTS)).toEqual({ label: "รวม 2 เอเย่นต์", verdict: "ทั้ง 2 เอเย่นต์ต่ำกว่าเป้าตามเวลา หนักสุดอีสานรุ่งโรจน์ ค้าส่ง" });
  });

  test("the rep's own four agents read รวม 4 เอเย่นต์", () => {
    expect(overallOf(REP_AGENTS).label).toBe("รวม 4 เอเย่นต์");
  });

  test("every agent of the region the card is about stays รวมทุกเอเย่นต์", () => {
    expect(overallOf(REGION_AGENTS).label).toBe("รวมทุกเอเย่นต์");
  });

  test("the overdue card beside it says ทั้ง 2 เอเย่นต์, never ทุกเอเย่นต์", () => {
    const { label, verdict } = overallOf(TWO_AGENTS_OVERDUE);
    expect(label).toBe("รวม 2 เอเย่นต์");
    expect(verdict ?? "").toContain("ทั้ง 2 เอเย่นต์");
    expect(verdict ?? "").not.toContain("ทุกเอเย่นต์");
  });
});
