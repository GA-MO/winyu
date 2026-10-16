import type { MetricQuery } from "@/lib/contracts";
import { addDays, businessDay, DATA_AS_OF } from "@/lib/data/dates";

/** One read tool call the gallery runs for the signed-in user. */
export type ReadSample = { tool: string; caption: string; question: string; input: Record<string, unknown>; with?: Record<string, unknown> };

/** One write tool call the gallery shows as an approval decision. */
export type WriteSample = { tool: string; caption: string; input: Record<string, unknown> };

const MONTH_START = `${DATA_AS_OF.slice(0, 7)}-01`;

const SALES_BY_REGION: MetricQuery = {
  metric: "net_sales_value",
  dims: ["region"],
  filters: {},
  range: { from: MONTH_START, to: DATA_AS_OF },
  grain: "month",
  compare: "prev_period",
  limit: null,
};

const WEEKLY_VOLUME: MetricQuery = {
  metric: "net_sales_volume",
  dims: ["week"],
  filters: {},
  range: { from: addDays(DATA_AS_OF, -83), to: DATA_AS_OF },
  grain: "week",
  compare: "none",
  limit: null,
};

const TOP_AGENTS: MetricQuery = {
  metric: "net_sales_volume",
  dims: ["agent"],
  filters: { region: ["northeast"] },
  range: { from: MONTH_START, to: DATA_AS_OF },
  grain: "month",
  compare: "prev_period",
  limit: 8,
  sort: "delta_asc",
};

const THIS_MONTH = { filters: {}, grain: "month", limit: 10, period: "this_month" };

/** Questions the second simulated round answered badly (docs/issues/ai-answers.md, รอบทดสอบที่ 2), as the model asked them. */
const ROUND_TWO: ReadSample[] = [
  { tool: "query_metric", caption: "AI-53 · เดือนนี้เทียบเป้า แยกรายเดือน", question: "เดือนนี้ขายได้กี่เปอร์เซ็นต์ของเป้าทั้งเดือน", input: { ...THIS_MONTH, metric: "net_sales_volume", dims: ["month"], compare: "target" } },
  {
    tool: "query_metric",
    caption: "AI-66 · เทียบเป้าและเทียบงวดก่อน",
    question: "ลีโออีสาน เอเย่นต์ไหนลดลงหนักสุด",
    input: { ...THIS_MONTH, metric: "net_sales_value", dims: ["agent", "province"], filters: { region: ["northeast"], brand: ["leo"] }, compare: "target", sort: "delta_asc", limit: 5 },
    with: { ...THIS_MONTH, metric: "net_sales_value", dims: ["agent", "province"], filters: { region: ["northeast"], brand: ["leo"] }, compare: "prev_period", sort: "delta_asc", limit: 5 },
  },
  { tool: "query_metric", caption: "AI-67 · สต๊อกล้น", question: "มีสต๊อกล้นตรงไหนไหม", input: { ...THIS_MONTH, metric: "days_of_cover", dims: ["brand"], compare: "prev_period", sort: "value_desc", limit: 5 } },
  { tool: "query_metric", caption: "AI-68 · เลขปีก่อน", question: "ไหนเลขปีก่อน", input: { metric: "ar_overdue", dims: ["agent"], filters: { region: "south" }, range: { from: "2026-10-01", to: "2026-10-31" }, grain: "month", compare: "prev_year", sort: "delta_desc", limit: 10 } },
  { tool: "query_metric", caption: "AI-69 · เดือนเดียว แยกกลุ่มธุรกิจ", question: "กำไรขั้นต้นกลุ่มนำเข้าเดือนนี้โต 5% จริงไหม", input: { ...THIS_MONTH, metric: "gross_margin", dims: ["month", "business_unit"], compare: "prev_period" } },
  {
    tool: "query_metric",
    caption: "AI-70 · สองตัวเลข สี่จังหวัด",
    question: "ยอดขายใต้แยกจังหวัด เทียบกับหนี้ค้าง",
    input: { ...THIS_MONTH, metric: "net_sales_value", dims: ["province"], filters: { region: "south" }, compare: "target", sort: "value_desc", limit: 14 },
    with: { ...THIS_MONTH, metric: "ar_overdue", dims: ["province"], filters: { region: "south" }, compare: "prev_period", sort: "value_desc", limit: 14 },
  },
  { tool: "query_metric", caption: "AI-71 · อาทิตย์นี้รายวัน", question: "ยอดขอนแก่นอาทิตย์นี้เป็นไง", input: { metric: "net_sales_volume", dims: ["date"], filters: { province: "ขอนแก่น" }, grain: "day", period: "this_week", compare: "prev_period", sort: "delta_desc", limit: 10 } },
  { tool: "query_metric", caption: "AI-76 · หนี้ค้างรายภาค limit 5", question: "ความเสี่ยงอื่นก่อนขึ้นบอร์ด", input: { ...THIS_MONTH, metric: "ar_overdue", dims: ["region"], compare: "prev_period", sort: "value_desc", limit: 5 } },
  { tool: "query_metric", caption: "AI-83 · รายสัปดาห์เดือนนี้", question: "อุบลศรีสุข รายสัปดาห์", input: { ...THIS_MONTH, metric: "net_sales_volume", dims: ["week"], filters: { agent: "ag_nea_05" }, grain: "week", compare: "prev_period", limit: 12 } },
  {
    tool: "query_metric",
    caption: "parity · ขายเข้าเทียบขายออก",
    question: "เทียบยอดขายเข้ากับยอดขายออกของเอเย่นต์",
    input: { ...THIS_MONTH, metric: "net_sales_volume", dims: ["agent"], filters: { region: "northeast" }, compare: "none" },
    with: { ...THIS_MONTH, metric: "sell_out_volume", dims: ["agent"], filters: { region: "northeast" }, compare: "none" },
  },
];

const MONTH_TO_DATE = { from: MONTH_START, to: DATA_AS_OF };

/** Questions the third simulated round answered badly (docs/issues/ai-answers.md, รอบทดสอบที่ 3), as the model asked them; sign in as the role named in the caption. */
const ROUND_THREE: ReadSample[] = [
  { tool: "query_metric", caption: "AI-101/102 · rep · % ของเป้าทั้งเดือน รายเอเย่นต์", question: "เดือนนี้ผมขายได้กี่เปอร์เซ็นต์ของเป้าทั้งเดือนแล้ว ต้องขายอีกกี่ลิตรถึงจะครบเป้า", input: { ...THIS_MONTH, metric: "net_sales_volume", dims: ["agent"], compare: "target", sort: "value_desc" } },
  { tool: "query_metric", caption: "AI-103 · CEO · เป้า แยกเอเย่นต์×จังหวัด เรียงตามส่วนต่าง", question: "เอเย่นต์ไหนในอีสานต่ำกว่าเป้ามากสุด", input: { ...THIS_MONTH, metric: "net_sales_value", dims: ["agent", "province"], filters: { region: ["northeast"] }, compare: "target", sort: "delta_asc", limit: null } },
  { tool: "query_metric", caption: "AI-105 · CEO · 10 SKU เทียบเป้า", question: "ยอดขายเข้าจะปิดเดือนต่ำกว่าเป้ามาก หนักสุดที่ลีโอขวด", input: { metric: "net_sales_volume", dims: ["sku"], filters: { agent: ["ag_nea_02"] }, range: MONTH_TO_DATE, grain: "day", compare: "target", sort: "delta_asc", limit: 10 } },
  { tool: "query_metric", caption: "AI-105 · CEO · 10 SKU ที่ลดลงมากสุด", question: "SKU ไหนของอีสานรุ่งโรจน์ตกหนักสุด", input: { metric: "net_sales_volume", dims: ["sku"], filters: { agent: ["ag_nea_02"] }, range: MONTH_TO_DATE, grain: "month", compare: "prev_period", sort: "delta_asc", limit: 10 } },
  { tool: "query_metric", caption: "AI-106 · rep · ก.ย.–ต.ค. ขอนแก่นเทียบเป้า", question: "ผมจำได้ว่ากันยานี้ขอนแก่นทำได้ 2.5 ล้านลิตร เกินเป้าไปแล้วใช่ไหม", input: { metric: "net_sales_volume", dims: ["month", "province"], filters: { province: "ขอนแก่น" }, range: { from: "2026-09-01", to: "2026-10-31" }, grain: "month", compare: "target", limit: 10 } },
  { tool: "query_metric", caption: "AI-107 · CEO · มาร์จินกลุ่มเบียร์", question: "ฝ่ายการเงินบอกว่ามาร์จินกลุ่มเบียร์เดือนนี้ขึ้นไป 30% แล้ว ใช่ไหม", input: { ...THIS_MONTH, metric: "gross_margin", dims: ["business_unit"], compare: "none", sort: "value_desc" } },
  { tool: "query_metric", caption: "AI-107 · CEO · กำไรขั้นต้นกลุ่มนำเข้า", question: "กำไรขั้นต้นกลุ่มนำเข้าเดือนนี้โตขึ้น 5% ตามที่ CFO รายงานใช่ไหม", input: { ...THIS_MONTH, metric: "gross_margin", dims: ["month", "business_unit"], compare: "prev_period" } },
  { tool: "query_metric", caption: "AI-114 · CEO · อีสานเทียบปีก่อน", question: "ยอดขายอีสานเดือนนี้เทียบปีก่อน", input: { ...THIS_MONTH, metric: "net_sales_value", dims: ["region"], filters: { region: ["northeast"] }, compare: "prev_year" } },
  {
    tool: "query_metric",
    caption: "AI-122 · RSM · ทั้งภาคเทียบอุบลศรีสุข",
    question: "ทั้งภาคค้างรวมเท่าไหร่อะ เทียบกับอุบลศรีสุข",
    input: { ...THIS_MONTH, metric: "ar_overdue", dims: ["region"], filters: { region: "northeast" }, compare: "none" },
    with: { ...THIS_MONTH, metric: "ar_overdue", dims: ["agent"], filters: { region: "northeast" }, compare: "none", sort: "value_desc", limit: 20 },
  },
  {
    tool: "query_metric",
    caption: "AI-124 · CEO · ยอดขายเทียบเป้ากับกำไร",
    question: "ช่วยสรุปผลงานเดือนนี้ให้หน่อยครับ ยอดขายเทียบเป้ากับกำไร ผมจะเอาไปเปิดประชุมบอร์ด",
    input: { ...THIS_MONTH, metric: "net_sales_value", dims: ["region"], compare: "target" },
    with: { ...THIS_MONTH, metric: "gross_margin", dims: ["region"], compare: "prev_year" },
  },
  { tool: "query_metric", caption: "AI-104 · CEO · หนี้ค้างรายภาคเทียบงวดก่อน", question: "ความเสี่ยงหนี้ค้างตอนนี้อยู่ภาคไหน", input: { ...THIS_MONTH, metric: "ar_overdue", dims: ["region"], compare: "prev_period" } },
  { tool: "query_metric", caption: "AI-125 · rep · หนี้ค้างที่ถูกซ่อน", question: "ขอยอดหนี้ค้างชำระของอีสานรุ่งโรจน์หน่อย", input: { ...THIS_MONTH, metric: "ar_overdue", dims: ["agent"], filters: { agent: "ag_nea_02" }, compare: "none" } },
  { tool: "list_metrics", caption: "AI-110 · ค้นว่า สต็อก", question: "มีข้อมูลสต็อกไหม", input: { search: "สต็อก" } },
];

export const READ_SAMPLES: ReadSample[] = [
  ...ROUND_THREE,
  ...ROUND_TWO,
  { tool: "query_metric", caption: "query_metric · แยกตามภาค", question: "ยอดขายเป็นเงินเดือนนี้แยกตามภาค", input: SALES_BY_REGION },
  { tool: "query_metric", caption: "query_metric · แนวโน้มรายสัปดาห์", question: "ปริมาณขาย 12 สัปดาห์ล่าสุด", input: WEEKLY_VOLUME },
  { tool: "query_metric", caption: "query_metric · เอเย่นต์ที่ลดลงมากสุด", question: "เอเย่นต์ภาคอีสานที่ยอดตกมากที่สุด", input: TOP_AGENTS },
  { tool: "get_alerts", caption: "get_alerts", question: "มีอะไรผิดปกติบ้าง", input: { status: "open", limit: 5 } },
  { tool: "get_forecast", caption: "get_forecast", question: "พยากรณ์ปริมาณขาย 8 สัปดาห์", input: { metric: "net_sales_volume", dims: {}, weeks: 8 } },
  {
    tool: "explain_gap",
    caption: "explain_gap",
    question: "ยอดขายเดือนนี้ห่างจากเดือนก่อนเพราะอะไร",
    input: { metric: "net_sales_value", split: "region", filters: {}, range: { from: MONTH_START, to: DATA_AS_OF }, compare: "prev_period" },
  },
  { tool: "get_calendar", caption: "get_calendar", question: "วันสำคัญที่จะกระทบยอดขาย", input: { from: null, to: null } },
  { tool: "find_people", caption: "find_people", question: "ทีมของฉันมีใครบ้าง", input: { region: null, department: null, manager: null, query: null, flag: null } },
  { tool: "get_person", caption: "get_person", question: "ขอดูโปรไฟล์คุณอนุชา", input: { id: null, name: "อนุชา" } },
  { tool: "get_site", caption: "get_site · ทุกสถานที่", question: "ความปลอดภัยของทุกสถานที่", input: { id: null, name: null } },
  { tool: "get_site", caption: "get_site · สถานที่เดียว", question: "ความปลอดภัยของโรงงานขอนแก่น", input: { id: "pl_khonkaen", name: null } },
  { tool: "list_candidates", caption: "list_candidates", question: "ผู้สมัครงานตอนนี้", input: { position: null, stage: null } },
  { tool: "list_courses", caption: "list_courses", question: "มีหลักสูตรอะไรเปิดบ้าง", input: { month: null, query: null } },
  { tool: "get_policy", caption: "get_policy · การลา", question: "ฉันเหลือวันลาเท่าไร", input: { topic: "leave" } },
  { tool: "get_policy", caption: "get_policy · สวัสดิการ", question: "สวัสดิการมีอะไรบ้าง", input: { topic: "benefits" } },
  { tool: "describe_entity", caption: "describe_entity", question: "อุบลศรีสุข เทรดดิ้ง คือใคร", input: { kind: "agent", query: "อุบลศรีสุข" } },
  { tool: "resolve_owner", caption: "resolve_owner", question: "ใครดูแลยอดขายภาคอีสาน", input: { metric: "net_sales_value", dims: { region: "northeast" } } },
  { tool: "recall_memory", caption: "recall_memory", question: "จำอะไรเกี่ยวกับฉันได้บ้าง", input: { query: "ยอดขาย" } },
  { tool: "list_metrics", caption: "list_metrics", question: "ถามเรื่องอะไรได้บ้าง", input: { search: null } },
  { tool: "store_visits", caption: "store_visits", question: "ไปเยี่ยมเอเย่นต์ล่าสุดเมื่อไร", input: { agentId: null } },
  { tool: "training_history", caption: "training_history", question: "ประวัติอบรมของทีม", input: { employeeId: null, name: null } },
  { tool: "admin_audit", caption: "admin_audit · role_access", question: "ฝ่ายขายเห็นอะไรบ้าง", input: { topic: "role_access", days: null, role: "sales_rep" } },
  { tool: "admin_audit", caption: "admin_audit · model_cost", question: "ใช้ไปกี่ตัง", input: { topic: "model_cost", days: 7, role: null } },
  { tool: "admin_audit", caption: "admin_audit · tool_usage", question: "การใช้งานเครื่องมือ", input: { topic: "tool_usage", days: 7, role: null } },
  { tool: "admin_audit", caption: "admin_audit · activity", question: "ใครส่งงานอะไรให้ใคร", input: { topic: "activity", days: 7, role: null } },
  { tool: "admin_audit", caption: "admin_audit · denials", question: "สัปดาห์นี้ใครถูกปฏิเสธสิทธิ์บ้าง", input: { topic: "denials", days: 7, role: null } },
  { tool: "admin_audit", caption: "admin_audit · user_usage", question: "ใครใช้ Winyu เยอะที่สุด", input: { topic: "user_usage", days: 7, role: null } },
  { tool: "admin_audit", caption: "admin_audit · role_access masked", question: "พนักงานขายถูกซ่อนตัวเลขอะไรบ้าง เอาเฉพาะที่ซ่อน", input: { topic: "role_access", days: null, role: "sales_rep", level: "masked" } },
];

export const WRITE_SAMPLES: WriteSample[] = [
  { tool: "request_leave", caption: "request_leave", input: { kind: "annual", from: businessDay(7), to: businessDay(9), reason: "พาครอบครัวไปเที่ยว" } },
  { tool: "enroll_course", caption: "enroll_course", input: { courseId: "crs_sales_licence" } },
  {
    tool: "send_card",
    caption: "send_card",
    input: {
      to: ["u_anucha"],
      ask: "ช่วยตรวจอุบลศรีสุข เทรดดิ้ง แล้วบอกกลับว่ายอดหายไปเพราะอะไร",
      intent: "act",
      urgency: "now",
      card: { reads: [{ tool: "query_metric", input: TOP_AGENTS }] },
    },
  },
  { tool: "send_email", caption: "send_email", input: { toUserId: "u_may", subject: "ขอสิทธิ์ดูเงินเดือนเฉลี่ย", body: "ขอสิทธิ์ดูเงินเดือนเฉลี่ยของฝ่ายขายเพื่อวางแผนปีหน้าครับ" } },
  { tool: "pin_widget", caption: "pin_widget", input: { title: "ยอดขายเป็นเงินแยกตามภาค", kind: "bar", query: SALES_BY_REGION } },
  { tool: "watch_metric", caption: "watch_metric", input: { title: "สต๊อกลำพูนต่ำกว่า 10 วัน", query: { ...SALES_BY_REGION, metric: "days_of_cover", dims: ["dc"], filters: { dc: ["dc_lamphun"] } }, condition: { kind: "below", value: 10 } } },
  { tool: "run_job", caption: "run_job", input: { job: "forecast" } },
  { tool: "set_permission", caption: "set_permission", input: { role: "sales_rep", kind: "metric", key: "avg_salary", value: "masked" } },
];
