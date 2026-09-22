import type { AccessContext, QuickAction, RoleId } from "@/lib/contracts";

const MAX_ACTIONS = 6;

const SHARED_ACTIONS: QuickAction[] = [
  { id: "qa_attainment", label: "ยอดเทียบเป้าแยกตามภาค", prompt: "ยอดขายเดือนนี้เทียบเป้าแยกตามภาค", score: 0.92, reason: "คุณถามคำถามนี้ทุกต้นสัปดาห์", intentKey: "target_attainment|region" },
  { id: "qa_falling_agents", label: "เอเย่นต์ยอดตก 10 อันดับ", prompt: "เอเย่นต์ 10 อันดับที่ยอดตกเทียบไตรมาสก่อน", score: 0.87, reason: "ถามบ่อยหลังปิดสัปดาห์", intentKey: "net_sales_volume|agent" },
  { id: "qa_stockout", label: "SKU เสี่ยง stock-out", prompt: "SKU ไหนเสี่ยง stock-out ใน 4 สัปดาห์", score: 0.81, reason: "สต๊อกต่ำกว่าเกณฑ์ในบางดีซี", intentKey: "days_of_cover|sku" },
  { id: "qa_why_down", label: "ทำไมยอดสัปดาห์นี้ตก", prompt: "ทำไมยอดสัปดาห์นี้ตก", score: 0.78, reason: "ระบบพบยอดลดผิดปกติเมื่อคืน", intentKey: "sell_out_volume|week" },
];

const ROLE_ACTIONS: Partial<Record<RoleId, QuickAction[]>> = {
  ceo: [{ id: "qa_margin_bu", label: "กำไรขั้นต้นตามกลุ่มธุรกิจ", prompt: "กำไรขั้นต้นไตรมาสนี้แยกตามกลุ่มธุรกิจ", score: 0.74, reason: "ใช้เตรียมประชุมบอร์ด", intentKey: "gross_margin|business_unit" }],
  cfo: [{ id: "qa_ar", label: "ลูกหนี้ค้างชำระ", prompt: "ลูกหนี้ค้างชำระเกิน 60 วันมีเท่าไร แยกตามภาค", score: 0.76, reason: "ถามบ่อยช่วงปิดเดือน", intentKey: "ar_overdue|region" }],
  sales_director: [{ id: "qa_region_gap", label: "ภาคไหนห่างเป้ามากที่สุด", prompt: "ภาคไหนห่างจากเป้ามากที่สุดเดือนนี้", score: 0.75, reason: "ถามก่อนประชุมทีมขาย", intentKey: "target_attainment|region" }],
  sales_rsm: [{ id: "qa_sell_out_gap", label: "ยอดขายเข้าเทียบยอดขายออก", prompt: "เปรียบเทียบยอดขายเข้ากับยอดขายออกของเอเย่นต์ในภาคของผม", score: 0.79, reason: "ช่วยจับสต๊อกค้างที่เอเย่นต์", intentKey: "sell_out_volume|agent" }],
  sales_rep: [{ id: "qa_my_agents", label: "เอเย่นต์ที่ผมดูแล", prompt: "สรุปยอดของเอเย่นต์ที่ผมดูแลเดือนนี้", score: 0.8, reason: "เปิดดูทุกเช้า", intentKey: "net_sales_volume|agent" }],
  marketing_lead: [{ id: "qa_campaign", label: "แคมเปญไหนคุ้มที่สุด", prompt: "แคมเปญไหนให้ผลยกระดับยอดขายคุ้มที่สุดในไตรมาสนี้", score: 0.83, reason: "ถามทุกครั้งหลังจบแคมเปญ", intentKey: "campaign_uplift|campaign" }],
  supply_planner: [{ id: "qa_cover", label: "ดีซีไหนสต๊อกต่ำ", prompt: "ดีซีไหนมีจำนวนวันที่สต๊อกพอขายต่ำกว่า 10 วัน", score: 0.85, reason: "เกณฑ์เตือนของคุณคือ 10 วัน", intentKey: "days_of_cover|dc" }],
  finance_analyst: [{ id: "qa_budget", label: "งบเทียบจริง", prompt: "เปรียบเทียบงบกับยอดจริงของเดือนนี้", score: 0.77, reason: "ถามบ่อยช่วงปิดเดือน", intentKey: "gross_margin|month" }],
  hr_manager: [{ id: "qa_attrition", label: "อัตราการลาออก", prompt: "อัตราการลาออกเดือนนี้เทียบปีที่แล้วเป็นอย่างไร", score: 0.82, reason: "ติดตามทุกเดือน", intentKey: "attrition_rate|month" }],
  it_admin: [{ id: "qa_audit", label: "การใช้งานเครื่องมือ", prompt: "สรุปการเรียกใช้เครื่องมือย้อนหลัง 7 วัน", score: 0.7, reason: "ตรวจสอบการใช้งานประจำสัปดาห์", intentKey: "audit|tool" }],
};

/** The chips the landing shows: shared defaults first, then what this role asks for most. 2A replaces this with the learned recommender. */
export function quickActionsFor(access: AccessContext): QuickAction[] {
  const roleActions = ROLE_ACTIONS[access.role] ?? [];
  return [...SHARED_ACTIONS, ...roleActions].slice(0, MAX_ACTIONS);
}
