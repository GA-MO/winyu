import type { CardBody } from "@/lib/cards/present";
import type { Dim, MetricId, MetricSort } from "@/lib/contracts";

/** The read tools whose fixed card answers a metric question. */
export type MetricCardTool = "query_metric" | "get_alerts" | "get_forecast";

/** The reads whose answer the model composes as one card. */
export type ComposedTool = "find_people" | "get_person" | "get_site" | "list_candidates" | "list_courses" | "get_policy";

/** One question a demo actually gets, who asks it, and what a good answer must be true of. Ported from the `eval:cards` cases of the Vexa build. */
export type EvalCase = {
  id: string;
  userId: string;
  prompt: string;
  before?: string[];
  expectCard?: MetricCardTool;
  expectSort?: MetricSort;
  expectApproval?: "watch_metric" | "create_handoff" | "pin_widget" | "set_permission" | "share_card";
  expectRecipient?: string;
  expectPermission?: { role: string; kind: "metric" | "tool" | "field"; key: string; value: string };
  expectCompare?: { compare: "prev_period" | "prev_year"; range?: { from: string; to: string } };
  expectShape?: CardBody["kind"];
  expectMetrics?: MetricId[][];
  expectPeople?: ComposedTool;
  expectPress?: "ask" | "enroll_course";
  forbidCarousel?: boolean;
  expectFilter?: { dim: Dim; values: string[] };
  expectRecall?: true;
  expectDocuments?: { cite: string } | { notFound: true; hidden?: string };
};

/** The questions a demo actually gets asked, one per card shape and per persona scope. The Vexa build's funnel, scatter and sell-through cases drew one card from several bound results (`with`); Winyu draws one card per `query_metric`, so they check that every metric was asked with the same dims and range instead. */
export const EVAL_CASES: EvalCase[] = [
  { id: "ceo-attainment", userId: "u_thana", prompt: "ยอดขายทั้งประเทศเทียบเป้าตอนนี้เท่าไหร่", expectCard: "query_metric" },
  { id: "ceo-by-region", userId: "u_thana", prompt: "ยอดขายแยกตามภาคเดือนนี้", expectCard: "query_metric", expectSort: "value_desc" },
  { id: "ceo-decline", userId: "u_thana", prompt: "เอเย่นต์ไหนยอดตกแรงที่สุดเทียบงวดก่อน", expectCard: "query_metric", expectSort: "delta_asc" },
  { id: "ceo-trend", userId: "u_thana", prompt: "แนวโน้มยอดขายรายเดือนปีนี้เป็นยังไง", expectCard: "query_metric" },
  { id: "ceo-alerts", userId: "u_thana", prompt: "ตอนนี้มีอะไรผิดปกติบ้าง", expectCard: "get_alerts" },
  { id: "cfo-ar", userId: "u_siriporn", prompt: "ลูกหนี้ค้างชำระตอนนี้แยกตามภาค", expectCard: "query_metric", expectSort: "value_desc" },
  { id: "cfo-masked", userId: "u_siriporn", prompt: "เงินเดือนเฉลี่ยแต่ละฝ่ายเท่าไหร่", expectCard: "query_metric" },
  { id: "rsm-own-region", userId: "u_anucha", prompt: "ยอดขายภาคอีสานเดือนนี้เทียบเป้า", expectCard: "query_metric" },
  { id: "rsm-agents", userId: "u_anucha", prompt: "เอเย่นต์ในภาคผมที่ยอดตก", expectCard: "query_metric", expectSort: "delta_asc" },
  { id: "planner-cover", userId: "u_wee", prompt: "ศูนย์กระจายสินค้าไหนสต๊อกจะขาดก่อน", expectCard: "query_metric", expectSort: "value_asc" },
  { id: "planner-forecast", userId: "u_wee", prompt: "พยากรณ์ยอดขายอีก 8 สัปดาห์", expectCard: "get_forecast" },
  { id: "marketing-campaign", userId: "u_ben", prompt: "แคมเปญไหนได้ผลดีที่สุด", expectCard: "query_metric", expectSort: "value_desc" },
  { id: "hr-attrition", userId: "u_may", prompt: "อัตราการลาออกแต่ละฝ่ายเป็นยังไง", expectCard: "query_metric" },
  { id: "rep-denied", userId: "u_krit", prompt: "กำไรขั้นต้นของบริษัทเท่าไหร่" },
  { id: "hr-headcount", userId: "u_may", prompt: "จำนวนพนักงานแต่ละฝ่ายเทียบปีที่แล้ว", expectCard: "query_metric", expectSort: "value_desc" },
  { id: "finance-budget", userId: "u_mint", prompt: "เปรียบเทียบงบกับยอดจริงของเดือนนี้", expectCard: "query_metric" },
  { id: "landing-alert-marketing", userId: "u_ben", prompt: "ตรวจความผิดปกติของ เพอร์ร่า ขวด PET 600 มล. · เชียงใหม่ · ภาคเหนือ ให้หน่อย", expectCard: "get_alerts" },
  { id: "landing-alert-finance", userId: "u_mint", prompt: "ตรวจความผิดปกติของ ภาคใต้ ให้หน่อย", expectCard: "get_alerts" },
  { id: "landing-visit", userId: "u_krit", prompt: "เทียบยอดขายเข้ากับยอดขายออกของ อุบลศรีสุข เทรดดิ้ง ก่อนไปเยี่ยม", expectCard: "query_metric" },
  { id: "line-cover-below", userId: "u_arm", prompt: "สินค้าตัวไหนสต๊อกพอขายน้อยกว่า 10 วัน", expectCard: "query_metric" },
  { id: "line-cover-days", userId: "u_saranya", prompt: "สต๊อกน้ำดื่มสิงห์ที่ DC สงขลาพอขายกี่วัน", expectCard: "query_metric" },
  { id: "line-under-target", userId: "u_thana", prompt: "เช้านี้ภาคไหนยังไม่ถึงเป้าบ้าง", expectCard: "query_metric", expectShape: "gap" },
  { id: "line-province-target", userId: "u_anucha", prompt: "ยอดเทียบเป้ารายจังหวัดในภาคผมเดือนนี้", expectCard: "query_metric", expectShape: "gap" },
  { id: "line-drop-agents", userId: "u_prasit", prompt: "เอเย่นต์ที่ยอดหายมากสุดในอีสาน เทียบ 4 สัปดาห์ก่อน", expectCard: "query_metric", expectSort: "delta_asc", expectShape: "gap" },
  { id: "ceo-channel", userId: "u_thana", prompt: "ขอยอดขายแยกตามช่องทางหน่อย", expectCard: "query_metric", expectSort: "value_desc", expectShape: "share" },
  { id: "planner-watch", userId: "u_wee", prompt: "เตือนฉันถ้าสต๊อกดีซีลำพูนพอขายต่ำกว่า 10 วัน", expectApproval: "watch_metric" },
  { id: "compare-month-to-date", userId: "u_thana", prompt: "ยอดขายเดือนนี้เทียบเดือนก่อนเป็นยังไง", expectCard: "query_metric", expectCompare: { compare: "prev_period", range: { from: "2026-09-01", to: "2026-09-22" } } },
  { id: "compare-top-decliners", userId: "u_thana", prompt: "10 เอเย่นต์ที่ยอดขายเดือนที่แล้วตกมากที่สุดเทียบเดือนก่อนหน้า", expectCard: "query_metric", expectSort: "delta_asc", expectCompare: { compare: "prev_period", range: { from: "2026-08-01", to: "2026-08-31" } } },
  { id: "compare-stock-weekly", userId: "u_wee", prompt: "สต๊อกคงเหลือรายสัปดาห์ เทียบกับช่วงก่อนหน้า", expectCard: "query_metric", expectCompare: { compare: "prev_period" } },
  { id: "compare-ar-last-year", userId: "u_siriporn", prompt: "ลูกหนี้ค้างชำระภาคใต้เดือนที่แล้ว แยกตามเอเย่นต์ เทียบช่วงเดียวกันปีก่อน", expectCard: "query_metric", expectCompare: { compare: "prev_year", range: { from: "2026-08-01", to: "2026-08-31" } } },
  { id: "rsm-watch-agent", userId: "u_anucha", prompt: "ถ้ายอดขายเข้าของ ส.รุ่งเรือง เทรดดิ้ง เปลี่ยนเกิน 15% ให้เตือนผมด้วย", expectApproval: "watch_metric" },
  { id: "shape-stacked", userId: "u_thana", prompt: "ยอดขายรายเดือนแยกภาค 6 เดือนล่าสุด", expectCard: "query_metric", expectShape: "stacked" },
  { id: "shape-province", userId: "u_thana", prompt: "ยอดเทียบเป้ารายจังหวัดเดือนนี้", expectCard: "query_metric", expectShape: "gap" },
  { id: "shape-heatmap", userId: "u_thana", prompt: "ยอดขายแต่ละภาคแยกช่องทาง เทียบเดือนก่อน", expectCard: "query_metric", expectShape: "heatmap" },
  { id: "shape-funnel", userId: "u_thana", prompt: "เดือน ส.ค. ผลิตเบียร์ได้เท่าไหร่ ขายเข้าเท่าไหร่ ขายออกเท่าไหร่", expectCard: "query_metric", expectMetrics: [["production_output"], ["net_sales_volume"], ["sell_out_volume"]] },
  { id: "shape-scatter", userId: "u_thana", prompt: "เอเย่นต์ที่ขายมากค้างชำระมากด้วยไหม เดือน ส.ค.", expectCard: "query_metric", expectMetrics: [["net_sales_value", "net_sales_volume"], ["ar_overdue"]] },
  { id: "shape-sell-through", userId: "u_thana", prompt: "เทียบยอดขายเข้ากับยอดขายออกของเอเย่นต์", expectCard: "query_metric", expectMetrics: [["net_sales_volume", "net_sales_value"], ["sell_out_volume"]] },
  { id: "shape-share-market", userId: "u_anucha", prompt: "สัดส่วนตลาดเบียร์ในนครราชสีมาเดือน ส.ค. แต่ละผู้ผลิตได้เท่าไหร่", expectCard: "query_metric", expectShape: "share" },
  { id: "people-team", userId: "u_anucha", prompt: "ทีมขายภาคอีสานมีใครบ้าง", expectPeople: "find_people", expectPress: "ask", forbidCarousel: true },
  { id: "people-certs", userId: "u_may", prompt: "ใบอนุญาตหรือใบรับรองของใครใกล้หมดอายุบ้าง", expectPeople: "find_people" },
  { id: "people-profile", userId: "u_may", prompt: "ขอดูโปรไฟล์คุณจอย ศรีประเสริฐ", expectPeople: "get_person" },
  { id: "sites-overview", userId: "u_thana", prompt: "โรงงานไหนเกิดอุบัติเหตุบ้าง", expectPeople: "get_site", expectPress: "ask", forbidCarousel: true },
  { id: "sites-detail", userId: "u_may", prompt: "ดูความปลอดภัยของโรงงานขอนแก่น", expectPeople: "get_site" },
  { id: "candidates-khonkaen", userId: "u_may", prompt: "ผู้สมัครพนักงานขายขอนแก่น", expectPeople: "list_candidates", forbidCarousel: true },
  { id: "candidates-manager", userId: "u_anucha", prompt: "ตำแหน่งที่ผมเปิดรับมีผู้สมัครกี่คน ใครน่าสนใจ", expectPeople: "list_candidates", forbidCarousel: true },
  { id: "courses-month", userId: "u_may", prompt: "มีหลักสูตรอะไรเปิดเดือนนี้", expectPeople: "list_courses", expectPress: "enroll_course" },
  { id: "courses-rep", userId: "u_krit", prompt: "มีอบรมอะไรที่ผมควรไปบ้าง", expectPeople: "list_courses", expectPress: "enroll_course" },
  { id: "admin-metric", userId: "u_ton", prompt: "ให้พนักงานขายไม่เห็นมูลค่าขายเข้า", expectApproval: "set_permission", expectPermission: { role: "sales_rep", kind: "metric", key: "net_sales_value", value: "none" } },
  { id: "admin-tool", userId: "u_ton", prompt: "ปิดเครื่องมือดูประวัติการอบรมของพนักงานขาย", expectApproval: "set_permission", expectPermission: { role: "sales_rep", kind: "tool", key: "training_history", value: "deny" } },
  { id: "admin-field", userId: "u_ton", prompt: "ให้ผู้จัดการขายภาคเห็นคะแนนสอบของหลักสูตรเต็มๆ ไม่ต้องซ่อน", expectApproval: "set_permission", expectPermission: { role: "sales_rsm", kind: "field", key: "lms.score", value: "full" } },
  { id: "policy-leave", userId: "u_krit", prompt: "ลาพักร้อนยังไง", expectPeople: "get_policy" },
  { id: "people-rep-scope", userId: "u_krit", prompt: "ทีมขายภาคอีสานมีใครบ้าง", expectPeople: "find_people" },
  { id: "title-ar-rising", userId: "u_siriporn", prompt: "ลูกหนี้ค้างเกินกำหนดเอเย่นต์ไหนเพิ่มขึ้นบ้าง", expectCard: "query_metric", expectSort: "delta_desc" },
  { id: "title-named-decline", userId: "u_saranya", prompt: "เอเย่นต์ฝั่งอันดามันกับสมุย ใครขายออกตกบ้าง", expectCard: "query_metric", expectSort: "delta_asc" },
  { id: "title-cover-threshold", userId: "u_arm", prompt: "สินค้าตัวไหนสต๊อกพอขายน้อยกว่า 10 วัน", expectCard: "query_metric", expectSort: "value_asc" },
  { id: "forecast-target", userId: "u_prasit", prompt: "พยากรณ์ยอดขายทั้งประเทศ 8 สัปดาห์ จะถึงเป้าไหม", expectCard: "get_forecast" },
  { id: "freshness", userId: "u_ton", prompt: "metric ไหนมีข้อมูลล่าสุดถึงวันไหน" },
  { id: "title-share-loss", userId: "u_prasit", prompt: "จังหวัดไหนเสียส่วนแบ่งให้คู่แข่งมากที่สุด", expectCard: "query_metric", expectSort: "delta_asc" },
  { id: "memory-remember-region", userId: "u_thana", before: ["จำไว้นะว่าผมดูแลภาคอีสานเป็นหลัก เวลาถามยอดขายให้ดูภาคอีสาน"], prompt: "ยอดขายเดือนนี้เทียบเป้าเป็นยังไง", expectCard: "query_metric", expectFilter: { dim: "region", values: ["northeast"] } },
  { id: "memory-recall-thread", userId: "u_may", before: ["อัตราการลาออกแต่ละฝ่ายเป็นยังไง"], prompt: "ครั้งก่อนที่เราคุยเรื่องคนลาออก ฝ่ายไหนน่าห่วงที่สุดนะ", expectRecall: true },
  { id: "docs-credit-terms", userId: "u_krit", prompt: "เอเย่นต์เกรด B ได้เครดิตกี่วัน", expectDocuments: { cite: "sales-policy" } },
  { id: "docs-ban-holiday", userId: "u_anucha", prompt: "วันออกพรรษาปีนี้ร้านค้าขายเบียร์ได้ไหม", expectDocuments: { cite: "alcohol-compliance-guide" } },
  { id: "docs-hr-hidden", userId: "u_krit", prompt: "กระบอกเงินเดือนพนักงานแต่ละระดับเท่าไหร่", expectDocuments: { notFound: true, hidden: "hr-compensation-discipline" } },
  { id: "share-card-chat", userId: "u_thana", before: ["ยอดขายแยกตามภาคเดือนนี้"], prompt: "ส่งการ์ดนี้ให้คุณกฤตดูหน่อย", expectApproval: "share_card", expectRecipient: "u_krit" },
  { id: "handoff-not-share", userId: "u_thana", before: ["ยอดขายแยกตามภาคเดือนนี้"], prompt: "ฝากคุณอนุชาช่วยดูต่อเรื่องภาคอีสานที่ต่ำกว่าเป้าหน่อย", expectApproval: "create_handoff", expectRecipient: "u_anucha" },
  { id: "people-name-lookup", userId: "u_thana", prompt: "ค้นหาพนักงานชื่อกฤตให้หน่อย", expectPeople: "find_people" },
  { id: "docs-unanswerable", userId: "u_wee", prompt: "บริษัทอนุญาตให้พาสัตว์เลี้ยงมาที่ทำงานไหม", expectDocuments: { notFound: true } },
];

/** The group a case reports under, from what it expects: approvals, memory across conversations, company documents, composed answers, card shapes, period comparisons, alerts and forecasts, other metric cards, and the rest. */
export function groupOf(testCase: EvalCase): string {
  if (testCase.expectApproval) return "approval";
  if (testCase.before) return "memory";
  if (testCase.expectDocuments) return "documents";
  if (testCase.expectPeople) return "composed";
  if (testCase.expectShape || testCase.expectMetrics) return "shape";
  if (testCase.expectCompare) return "compare";
  if (testCase.expectCard === "get_alerts" || testCase.expectCard === "get_forecast") return "alerts-forecast";
  if (testCase.expectCard === "query_metric") return "metric";
  return "other";
}

/** The case with this id, or null. */
export function evalCase(id: string): EvalCase | null {
  return EVAL_CASES.find((testCase) => testCase.id === id) ?? null;
}
