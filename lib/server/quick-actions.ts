import { METRIC_IDS, type AccessContext, type MetricId, type QuickAction, type RoleId, type ToolName } from "@/lib/contracts";
import { isToolAllowed } from "@/lib/access/enforce";
import { quickActionsFrom } from "@/lib/engine/recommend";
import { TH } from "@/lib/i18n/th";

const MAX_ACTIONS = 6;
const METRIC_TOOL: ToolName = "query_metric";
const SUBJECT_TOOLS: Record<string, ToolName> = { calendar: "get_calendar", job: "run_job" };

const SHARED_ACTIONS: QuickAction[] = [
  { id: "qa_attainment", label: "ยอดเทียบเป้าแยกตามภาค", prompt: "ยอดขายเดือนนี้เทียบเป้าแยกตามภาค", score: 0.92, reason: "ดูว่าภาคไหนยังห่างเป้า", intentKey: "target_attainment|region" },
  { id: "qa_falling_agents", label: "เอเย่นต์ยอดตก 10 อันดับ", prompt: "เอเย่นต์ 10 อันดับที่ยอดตกเทียบไตรมาสก่อน", score: 0.87, reason: "หาเอเย่นต์ที่ต้องรีบคุยด้วย", intentKey: "net_sales_volume|agent" },
  { id: "qa_stockout", label: "SKU เสี่ยง stock-out", prompt: "SKU ไหนเสี่ยง stock-out ใน 4 สัปดาห์", score: 0.81, reason: "กันของขาดก่อนรอบเติมสินค้า", intentKey: "days_of_cover|sku" },
  { id: "qa_why_down", label: "ทำไมยอดสัปดาห์นี้ตก", prompt: "ทำไมยอดสัปดาห์นี้ตก", score: 0.78, reason: "หาสาเหตุเมื่อยอดสัปดาห์นี้ลดลง", intentKey: "sell_out_volume|week" },
];

const ROLE_ACTIONS: Partial<Record<RoleId, QuickAction[]>> = {
  ceo: [{ id: "qa_margin_bu", label: "กำไรขั้นต้นตามกลุ่มธุรกิจ", prompt: "กำไรขั้นต้นไตรมาสนี้แยกตามกลุ่มธุรกิจ", score: 0.74, reason: "ภาพรวมกำไรก่อนประชุมบอร์ด", intentKey: "gross_margin|business_unit" }, { id: "qa_market_share", label: "ส่วนแบ่งตลาดเทียบคู่แข่ง", prompt: "ส่วนแบ่งตลาดเทียบคู่แข่ง", score: 0.86, reason: "ดูว่าจังหวัดไหนเสียส่วนแบ่งให้คู่แข่ง", intentKey: "market_share|province" }],
  cfo: [{ id: "qa_ar", label: "ลูกหนี้ค้างชำระ", prompt: "ลูกหนี้ค้างชำระเกิน 60 วันมีเท่าไร แยกตามภาค", score: 0.76, reason: "ติดตามเงินค้างก่อนปิดเดือน", intentKey: "ar_overdue|region" }],
  sales_director: [{ id: "qa_region_gap", label: "ภาคไหนห่างเป้ามากที่สุด", prompt: "ภาคไหนห่างจากเป้ามากที่สุดเดือนนี้", score: 0.75, reason: "เตรียมประเด็นก่อนประชุมทีมขาย", intentKey: "target_attainment|region" }, { id: "qa_market_share", label: "ส่วนแบ่งตลาดเทียบคู่แข่ง", prompt: "ส่วนแบ่งตลาดเทียบคู่แข่ง", score: 0.86, reason: "ดูว่าจังหวัดไหนเสียส่วนแบ่งให้คู่แข่ง", intentKey: "market_share|province" }],
  sales_rsm: [{ id: "qa_sell_out_gap", label: "ยอดขายเข้าเทียบยอดขายออก", prompt: "เปรียบเทียบยอดขายเข้ากับยอดขายออกของเอเย่นต์ในภาคของผม", score: 0.79, reason: "ช่วยจับสต๊อกค้างที่เอเย่นต์", intentKey: "sell_out_volume|agent" }, { id: "qa_market_share", label: "ส่วนแบ่งตลาดเทียบคู่แข่ง", prompt: "ส่วนแบ่งตลาดเทียบคู่แข่ง", score: 0.86, reason: "ดูว่าจังหวัดไหนเสียส่วนแบ่งให้คู่แข่ง", intentKey: "market_share|province" }, { id: "qa_calendar", label: "วันห้ามขายและเทศกาลข้างหน้า", prompt: "เดือนหน้ามีวันไหนที่กระทบยอดขาย", score: 0.84, reason: "วางแผนสั่งสินค้าก่อนวันห้ามขาย", intentKey: "calendar|date" }],
  sales_rep: [{ id: "qa_my_agents", label: "เอเย่นต์ที่ผมดูแล", prompt: "สรุปยอดของเอเย่นต์ที่ผมดูแลเดือนนี้", score: 0.8, reason: "เริ่มวันจากเอเย่นต์ที่คุณดูแล", intentKey: "net_sales_volume|agent" }, { id: "qa_calendar", label: "วันห้ามขายและเทศกาลข้างหน้า", prompt: "เดือนหน้ามีวันไหนที่กระทบยอดขาย", score: 0.84, reason: "วางแผนสั่งสินค้าก่อนวันห้ามขาย", intentKey: "calendar|date" }],
  marketing_lead: [{ id: "qa_campaign", label: "แคมเปญไหนคุ้มที่สุด", prompt: "แคมเปญไหนให้ผลยกระดับยอดขายคุ้มที่สุดในไตรมาสนี้", score: 0.83, reason: "วัดความคุ้มของแคมเปญ", intentKey: "campaign_uplift|campaign" }, { id: "qa_market_share", label: "ส่วนแบ่งตลาดเทียบคู่แข่ง", prompt: "ส่วนแบ่งตลาดเทียบคู่แข่ง", score: 0.86, reason: "ดูว่าจังหวัดไหนเสียส่วนแบ่งให้คู่แข่ง", intentKey: "market_share|province" }],
  supply_planner: [{ id: "qa_cover", label: "DC ไหนสต๊อกต่ำ", prompt: "DC ไหนมีจำนวนวันที่สต๊อกพอขายต่ำกว่า 10 วัน", score: 0.85, reason: "เกณฑ์เตือนมาตรฐานคือ 10 วัน", intentKey: "days_of_cover|dc" }, { id: "qa_calendar", label: "วันห้ามขายและเทศกาลข้างหน้า", prompt: "เดือนหน้ามีวันไหนที่กระทบยอดขาย", score: 0.84, reason: "วางแผนสั่งสินค้าก่อนวันห้ามขาย", intentKey: "calendar|date" }],
  finance_analyst: [{ id: "qa_budget", label: "งบเทียบจริง", prompt: "เปรียบเทียบงบกับยอดจริงของเดือนนี้", score: 0.77, reason: "ติดตามเงินค้างก่อนปิดเดือน", intentKey: "gross_margin|month" }],
  hr_manager: [
    { id: "qa_attrition", label: "อัตราการลาออก", prompt: "อัตราการลาออกเดือนนี้เทียบปีที่แล้วเป็นอย่างไร", score: 0.82, reason: "ติดตามการลาออกรายเดือน", intentKey: "attrition_rate|month" },
    { id: "qa_headcount", label: "พนักงานแต่ละฝ่าย", prompt: "จำนวนพนักงานแต่ละฝ่ายเทียบปีที่แล้ว", score: 0.78, reason: "ใช้วางแผนกำลังคน", intentKey: "headcount|department" },
    { id: "qa_salary", label: "เงินเดือนเฉลี่ยรายฝ่าย", prompt: "เงินเดือนเฉลี่ยแต่ละฝ่ายเท่าไหร่", score: 0.74, reason: "ใช้ประกอบการทบทวนค่าตอบแทน", intentKey: "avg_salary|department" },
  ],
  it_admin: [
    { id: "qa_audit", label: "การใช้งานเครื่องมือ", prompt: "สรุปการเรียกใช้เครื่องมือย้อนหลัง 7 วัน", score: 0.7, reason: "ตรวจการใช้งานเครื่องมือ", intentKey: "audit|tool" },
    { id: "qa_rerun_anomaly", label: "รันตรวจความผิดปกติใหม่", prompt: "รันงานตรวจหาความผิดปกติใหม่ตอนนี้", score: 0.68, reason: "ใช้หลังโหลดข้อมูลชุดใหม่", intentKey: "job|anomaly" },
  ],
};

function toolAnswering(subject: string): ToolName | null {
  if (METRIC_IDS.includes(subject as MetricId)) return METRIC_TOOL;
  return SUBJECT_TOOLS[subject] ?? null;
}

function answerable(action: QuickAction, access: AccessContext): boolean {
  const subject = action.intentKey.split("|")[0] ?? "";
  const tool = toolAnswering(subject);
  if (tool && !isToolAllowed(access, tool)) return false;
  return !METRIC_IDS.includes(subject as MetricId) || access.metricAcl[subject as MetricId] === "full";
}

/** The role defaults a cold-start user sees before the recommender has any behaviour to learn from; the reason says so instead of claiming a habit. */
export function defaultActionsFor(access: AccessContext): QuickAction[] {
  const roleActions = ROLE_ACTIONS[access.role] ?? [];
  const starter = TH.quick.starter(TH.role[access.role]);
  return [...roleActions, ...SHARED_ACTIONS]
    .filter((action) => answerable(action, access))
    .slice(0, MAX_ACTIONS)
    .map((action) => ({ ...action, reason: `${starter} · ${action.reason}` }));
}

/** The chips the landing shows: what this user actually asks, the calendar's suggestions, then the role defaults. */
export function quickActionsFor(access: AccessContext): QuickAction[] {
  return quickActionsFrom(access, defaultActionsFor(access)).filter((action) => answerable(action, access));
}
