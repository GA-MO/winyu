import type { MetricQuery } from "@/lib/contracts";
import { addDays, TODAY } from "@/lib/data/dates";

/** One read tool call the gallery runs for the signed-in user. */
export type ReadSample = { tool: string; caption: string; question: string; input: Record<string, unknown> };

/** One write tool call the gallery shows as an approval decision. */
export type WriteSample = { tool: string; caption: string; input: Record<string, unknown> };

const MONTH_START = `${TODAY.slice(0, 7)}-01`;

const SALES_BY_REGION: MetricQuery = {
  metric: "net_sales_value",
  dims: ["region"],
  filters: {},
  range: { from: MONTH_START, to: TODAY },
  grain: "month",
  compare: "prev_period",
  limit: null,
};

const WEEKLY_VOLUME: MetricQuery = {
  metric: "net_sales_volume",
  dims: ["week"],
  filters: {},
  range: { from: addDays(TODAY, -83), to: TODAY },
  grain: "week",
  compare: "none",
  limit: null,
};

const TOP_AGENTS: MetricQuery = {
  metric: "net_sales_volume",
  dims: ["agent"],
  filters: { region: ["northeast"] },
  range: { from: MONTH_START, to: TODAY },
  grain: "month",
  compare: "prev_period",
  limit: 8,
  sort: "delta_asc",
};

export const READ_SAMPLES: ReadSample[] = [
  { tool: "query_metric", caption: "query_metric · แยกตามภาค", question: "ยอดขายเป็นเงินเดือนนี้แยกตามภาค", input: SALES_BY_REGION },
  { tool: "query_metric", caption: "query_metric · แนวโน้มรายสัปดาห์", question: "ปริมาณขาย 12 สัปดาห์ล่าสุด", input: WEEKLY_VOLUME },
  { tool: "query_metric", caption: "query_metric · เอเย่นต์ที่ลดลงมากสุด", question: "เอเย่นต์ภาคอีสานที่ยอดตกมากที่สุด", input: TOP_AGENTS },
  { tool: "get_alerts", caption: "get_alerts", question: "มีอะไรผิดปกติบ้าง", input: { status: "open", limit: 5 } },
  { tool: "get_forecast", caption: "get_forecast", question: "พยากรณ์ปริมาณขาย 8 สัปดาห์", input: { metric: "net_sales_volume", dims: {}, weeks: 8 } },
  {
    tool: "explain_gap",
    caption: "explain_gap",
    question: "ยอดขายเดือนนี้ห่างจากเดือนก่อนเพราะอะไร",
    input: { metric: "net_sales_value", split: "region", filters: {}, range: { from: MONTH_START, to: TODAY }, compare: "prev_period" },
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
  { tool: "crm_demo__store_visits", caption: "crm_demo__store_visits", question: "ไปเยี่ยมเอเย่นต์ล่าสุดเมื่อไร", input: { agentId: null, regions: null } },
  { tool: "lms_demo__training_history", caption: "lms_demo__training_history", question: "ประวัติอบรมของทีม", input: { employeeId: null, name: null, regions: null } },
];

export const WRITE_SAMPLES: WriteSample[] = [
  { tool: "request_leave", caption: "request_leave", input: { kind: "annual", from: addDays(TODAY, 7), to: addDays(TODAY, 9), reason: "พาครอบครัวไปเที่ยว" } },
  { tool: "enroll_course", caption: "enroll_course", input: { courseId: "crs_sales_licence" } },
  {
    tool: "create_handoff",
    caption: "create_handoff",
    input: {
      toUserId: "u_anucha",
      title: "อุบลศรีสุข เทรดดิ้ง · ภาคอีสาน",
      ask: "ช่วยตรวจอุบลศรีสุข เทรดดิ้ง แล้วบอกกลับว่ายอดหายไปเพราะอะไร",
      urgency: "high",
      evidence: [TOP_AGENTS],
      alertIds: ["al_7364476d77c8f435"],
    },
  },
  { tool: "send_email", caption: "send_email", input: { toUserId: "u_may", subject: "ขอสิทธิ์ดูเงินเดือนเฉลี่ย", body: "ขอสิทธิ์ดูเงินเดือนเฉลี่ยของฝ่ายขายเพื่อวางแผนปีหน้าครับ" } },
  { tool: "pin_widget", caption: "pin_widget", input: { title: "ยอดขายเป็นเงินแยกตามภาค", kind: "bar", query: SALES_BY_REGION } },
  { tool: "watch_metric", caption: "watch_metric", input: { title: "สต๊อกลำพูนต่ำกว่า 10 วัน", query: { ...SALES_BY_REGION, metric: "days_of_cover", dims: ["dc"], filters: { dc: ["dc_lamphun"] } }, condition: { kind: "below", value: 10 } } },
  { tool: "run_job", caption: "run_job", input: { job: "forecast" } },
  { tool: "set_permission", caption: "set_permission", input: { role: "sales_rep", kind: "metric", key: "avg_salary", value: "masked" } },
];
