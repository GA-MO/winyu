import { describe, expect, test } from "bun:test";
import { widgetKindSchema, type MetricHeadline, type MetricQuery, type MetricResult, type MetricRow } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { runMetric } from "@/lib/data/query";
import { DATA_AS_OF, monthStart } from "@/lib/data/dates";
import { templateFor } from "@/lib/dashboard/templates";
import { TH } from "@/lib/i18n/th";
import { presentCard, presentGap, type CardBody, type CardParts, type GapAnswer } from "./present";
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
    expect(tiles).toContain(`${TH.read.toTarget} 477.7 ล้านบาท`);
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
