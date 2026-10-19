import type { CardView, LockedRows } from "@/lib/cards/present";
import { addDays, DATA_AS_OF } from "@/lib/data/dates";
import type { ReadSample } from "../cards/samples";

/** One query_metric call the DataCard gallery draws, with the variant it is meant to land on and how the card is asked to draw it. */
export type DataCardSample = ReadSample & { group: string; view?: CardView; locked?: LockedRows };

const MONTH = { filters: {}, grain: "month", period: "this_month", limit: null };
const TWELVE_WEEKS = { from: addDays(DATA_AS_OF, -83), to: DATA_AS_OF };
const THIRTY_DAYS = { from: addDays(DATA_AS_OF, -29), to: DATA_AS_OF };
const TWO_MONTHS = { from: "2026-10-01", to: DATA_AS_OF };
const YEAR = { from: "2026-01-01", to: DATA_AS_OF };
const NORTHEAST = { region: ["northeast"] };

const SUMMARY = "C · สรุปหนึ่งขอบเขต";
const BREAKDOWN = "B / A · แยกรายการ";
const TIME = "เส้นเวลา";
const PAIRED = "สองคำตอบในการ์ดเดียว (R10)";
const FORCED = "ขอรูปแบบเอง (view)";

/** Every DataCard variant the decision table and the pairings can reach, one sample each, in the order the rules read. */
export const DATA_CARD_SAMPLES: DataCardSample[] = [
  { group: SUMMARY, tool: "query_metric", caption: "R14 · ปิดเดือนที่เท่าไหร่", question: "ทั้งประเทศจะปิดเดือนที่กี่ % ของเป้า", input: { ...MONTH, metric: "net_sales_value", dims: [], compare: "target" } },
  { group: SUMMARY, tool: "query_metric", caption: "R1 · แถวเดียว", question: "ยอดขายอีสานเดือนนี้เทียบปีก่อน", input: { ...MONTH, metric: "net_sales_value", dims: ["region"], filters: NORTHEAST, compare: "prev_year" } },
  { group: SUMMARY, tool: "query_metric", caption: "R2 · ช่วงสั้น เทียบเป้า", question: "ต.ค.–พ.ย. ทำได้ตามเป้าไหม", input: { metric: "net_sales_volume", dims: ["month"], filters: {}, range: TWO_MONTHS, grain: "month", compare: "target", limit: null } },
  { group: SUMMARY, tool: "query_metric", caption: "R2 · ช่วงสั้น", question: "ต.ค.–พ.ย. ขายได้เท่าไหร่", input: { metric: "net_sales_volume", dims: ["month"], filters: {}, range: TWO_MONTHS, grain: "month", compare: "prev_period", limit: null } },
  { group: SUMMARY, tool: "query_metric", caption: "R12 · เส้นเวลาเทียบเป้า", question: "ยอดขาย 12 สัปดาห์เทียบเป้า", input: { metric: "net_sales_volume", dims: ["week"], filters: {}, range: TWELVE_WEEKS, grain: "week", compare: "target", limit: null } },
  { group: SUMMARY, tool: "query_metric", caption: "R13 · ระดับขยับขั้น", question: "พนักงานรายเดือนปีนี้", input: { metric: "headcount", dims: ["month"], filters: {}, range: YEAR, grain: "month", compare: "none", limit: null } },
  { group: SUMMARY, tool: "query_metric", caption: "R15 · ยอดคงเหลือเทียบช่วง", question: "สต๊อกรายสัปดาห์", input: { metric: "days_of_cover", dims: ["week"], filters: {}, range: TWELVE_WEEKS, grain: "week", compare: "none", limit: null } },
  { group: SUMMARY, tool: "query_metric", caption: "R9 · แนวโน้ม", question: "ปริมาณขาย 12 สัปดาห์ล่าสุด", input: { metric: "net_sales_volume", dims: ["week"], filters: {}, range: TWELVE_WEEKS, grain: "week", compare: "none", limit: null } },

  { group: BREAKDOWN, tool: "query_metric", caption: "R14 · ปิดเดือน แยกภาค", question: "แต่ละภาคจะปิดเดือนที่กี่ % ของเป้า", input: { ...MONTH, metric: "net_sales_value", dims: ["region"], compare: "target" } },
  { group: BREAKDOWN, tool: "query_metric", caption: "R7 · ต่ำกว่าเกณฑ์ (where)", question: "เอเย่นต์อีสานที่ทำได้ต่ำกว่า 90% ของเป้า", input: { ...MONTH, metric: "target_attainment", dims: ["agent"], filters: NORTHEAST, compare: "none", where: { op: "below", value: 90 } } },
  { group: BREAKDOWN, tool: "query_metric", caption: "R3 · เทียบเป้า", question: "แต่ละภาคเทียบเป้า", input: { ...MONTH, metric: "net_sales_value", dims: ["region"], compare: "target" } },
  { group: BREAKDOWN, tool: "query_metric", caption: "R4 · สองมิติ เรียงตามการเปลี่ยน", question: "เอเย่นต์×จังหวัด อีสาน ที่ลดลงหนักสุด", input: { ...MONTH, metric: "net_sales_value", dims: ["agent", "province"], filters: NORTHEAST, compare: "prev_period", sort: "delta_asc", limit: 8 } },
  { group: BREAKDOWN, tool: "query_metric", caption: "สองมิติ ตารางแน่น → heatmap", question: "ปริมาณขาย ภาค×แบรนด์", input: { ...MONTH, metric: "net_sales_volume", dims: ["region", "brand"], compare: "none" } },
  { group: BREAKDOWN, tool: "query_metric", caption: "R6 · มีรายการต่ำกว่าเส้น", question: "สต๊อกพอขายกี่วัน แยกแบรนด์", input: { ...MONTH, metric: "days_of_cover", dims: ["brand"], compare: "none" } },
  { group: BREAKDOWN, tool: "query_metric", caption: "R6 · % ของเป้า แยกภาค", question: "แต่ละภาคทำได้กี่ % ของเป้า", input: { ...MONTH, metric: "target_attainment", dims: ["region"], compare: "none" } },
  { group: BREAKDOWN, tool: "query_metric", caption: "R4 · เรียงตามการเปลี่ยน", question: "จังหวัดไหนลดลงหนักสุด", input: { ...MONTH, metric: "net_sales_value", dims: ["province"], compare: "prev_period", sort: "delta_asc", limit: 8 } },
  { group: BREAKDOWN, tool: "query_metric", caption: "R5 · อันดับต้น (ตัดแถว)", question: "5 เอเย่นต์ยอดสูงสุด", input: { ...MONTH, metric: "net_sales_value", dims: ["agent"], compare: "prev_period", sort: "value_desc", limit: 5 } },
  { group: BREAKDOWN, tool: "query_metric", caption: "breakdown · สัดส่วน (share)", question: "ยอดขายแยกแบรนด์", input: { ...MONTH, metric: "net_sales_value", dims: ["brand"], compare: "none" } },
  { group: BREAKDOWN, tool: "query_metric", caption: "breakdown · แท่ง (B ≤ 8 แถว)", question: "ยอดขายแยกช่องทาง เทียบเดือนก่อน", input: { ...MONTH, metric: "net_sales_value", dims: ["channel"], compare: "prev_period" } },
  { group: BREAKDOWN, tool: "query_metric", caption: "breakdown · A (เกิน 8 แถว)", question: "ยอดขายแยกจังหวัด เทียบเดือนก่อน", input: { ...MONTH, metric: "net_sales_value", dims: ["province"], compare: "prev_period", limit: 40 } },

  { group: TIME, tool: "query_metric", caption: "เวลา×กลุ่ม · stacked", question: "ปริมาณขายรายสัปดาห์แยกแบรนด์", input: { metric: "net_sales_volume", dims: ["week", "brand"], filters: {}, range: { from: addDays(DATA_AS_OF, -55), to: DATA_AS_OF }, grain: "week", compare: "none", limit: null } },
  { group: TIME, tool: "query_metric", caption: "เวลา×กลุ่ม · area", question: "ปริมาณขายรายวัน 30 วันแยกแบรนด์", input: { metric: "net_sales_volume", dims: ["date", "brand"], filters: {}, range: THIRTY_DAYS, grain: "day", compare: "none", limit: null } },
  { group: TIME, tool: "query_metric", caption: "เวลา×กลุ่ม · เส้นหลายเส้น (อัตรา)", question: "% ของเป้า รายเดือน แยกภาค", input: { metric: "target_attainment", dims: ["month", "region"], filters: {}, range: YEAR, grain: "month", compare: "none", limit: null } },
  { group: TIME, tool: "query_metric", caption: "เวลา×กลุ่ม · heatmap", question: "% ของเป้า รายสัปดาห์ แยกจังหวัดอีสาน", input: { metric: "target_attainment", dims: ["week", "province"], filters: NORTHEAST, range: TWELVE_WEEKS, grain: "week", compare: "none", limit: null } },

  { group: PAIRED, tool: "query_metric", caption: "whole · ยอดรวม + แยกภาค", question: "ยอดขายเดือนนี้ทั้งหมดและแยกภาค", input: { ...MONTH, metric: "net_sales_value", dims: ["region"], compare: "prev_period" }, with: { ...MONTH, metric: "net_sales_value", dims: [], compare: "prev_period" } },
  { group: PAIRED, tool: "query_metric", caption: "baselines · เทียบเป้าและงวดก่อน", question: "ลีโออีสาน เอเย่นต์ไหนลดลงหนักสุด", input: { ...MONTH, metric: "net_sales_value", dims: ["agent"], filters: { region: ["northeast"], brand: ["leo"] }, compare: "target", sort: "delta_asc", limit: 5 }, with: { ...MONTH, metric: "net_sales_value", dims: ["agent"], filters: { region: ["northeast"], brand: ["leo"] }, compare: "prev_period", sort: "delta_asc", limit: 5 } },
  { group: PAIRED, tool: "query_metric", caption: "funnel · ขายเข้า → ขายออก", question: "ขายเข้ากับขายออกเดือนนี้", input: { ...MONTH, metric: "net_sales_volume", dims: [], compare: "none" }, with: { ...MONTH, metric: "sell_out_volume", dims: [], compare: "none" } },
  { group: PAIRED, tool: "query_metric", caption: "overlay · สองเส้นเวลา", question: "ขายเข้ากับขายออกรายสัปดาห์", input: { metric: "net_sales_volume", dims: ["week"], filters: {}, range: TWELVE_WEEKS, grain: "week", compare: "none", limit: null }, with: { metric: "sell_out_volume", dims: ["week"], filters: {}, range: TWELVE_WEEKS, grain: "week", compare: "none", limit: null } },
  { group: PAIRED, tool: "query_metric", caption: "gap · ขายเข้าเทียบขายออก รายเอเย่นต์", question: "เทียบยอดขายเข้ากับยอดขายออกของเอเย่นต์", input: { ...MONTH, metric: "net_sales_volume", dims: ["agent"], filters: NORTHEAST, compare: "none" }, with: { ...MONTH, metric: "sell_out_volume", dims: ["agent"], filters: NORTHEAST, compare: "none" } },
  { group: PAIRED, tool: "query_metric", caption: "scatter · ยอดขาย × หนี้ค้าง", question: "ยอดขายแยกจังหวัด เทียบกับหนี้ค้าง", input: { ...MONTH, metric: "net_sales_value", dims: ["province"], compare: "none" }, with: { ...MONTH, metric: "ar_overdue", dims: ["province"], compare: "none" } },
  { group: PAIRED, tool: "query_metric", caption: "twin · ยอดขายเทียบเป้า + กำไร", question: "ยอดขายเทียบเป้ากับกำไร แยกภาค", input: { ...MONTH, metric: "net_sales_value", dims: ["region"], compare: "target" }, with: { ...MONTH, metric: "gross_margin", dims: ["region"], compare: "prev_year" } },

  { group: FORCED, tool: "query_metric", caption: "view=table · เส้นเวลาเป็นตาราง", question: "ปริมาณขาย 12 สัปดาห์ เป็นตาราง", input: { metric: "net_sales_volume", dims: ["week"], filters: {}, range: TWELVE_WEEKS, grain: "week", compare: "prev_period", limit: null }, view: "table" },
  { group: FORCED, tool: "query_metric", caption: "view=heatmap · สัปดาห์×แบรนด์", question: "ปริมาณขายรายสัปดาห์แยกแบรนด์ เป็น heatmap", input: { metric: "net_sales_volume", dims: ["week", "brand"], filters: {}, range: TWELVE_WEEKS, grain: "week", compare: "none", limit: null }, view: "heatmap" },
  { group: FORCED, tool: "query_metric", caption: "view=metric · ตัวเลขเดียว", question: "ยอดขายแยกภาค ขอเลขเดียว", input: { ...MONTH, metric: "net_sales_value", dims: ["region"], compare: "prev_period" }, view: "metric" },
  { group: FORCED, tool: "query_metric", caption: "view=share · สัดส่วนช่องทาง", question: "สัดส่วนช่องทาง", input: { ...MONTH, metric: "net_sales_value", dims: ["channel"], compare: "prev_period" }, view: "share" },
  {
    group: FORCED,
    tool: "query_metric",
    caption: "locked · การ์ดที่แชร์ ซ่อนบางภาค",
    question: "ยอดขายแยกภาค",
    input: { ...MONTH, metric: "net_sales_value", dims: ["region"], filters: NORTHEAST, compare: "prev_period" },
    locked: { dim: "region", labels: ["ภาคกลาง", "ภาคเหนือ", "ภาคใต้"], askHref: "/dev/data-cards" },
  },
];
