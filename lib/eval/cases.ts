import type { CardBody } from "@/lib/cards/present";

export type EvalCase = {
  id: string;
  userId: string;
  prompt: string;
  expectSort?: "delta_asc" | "delta_desc" | "value_desc" | "value_asc";
  expectComponent?: "DataCard" | "AlertsCard";
  expectApproval?: "watch_metric" | "create_handoff" | "pin_widget";
  expectCompare?: { compare: "prev_period" | "prev_year"; range?: { from: string; to: string } };
  expectShape?: CardBody["kind"];
  expectPeople?: "find_people" | "get_person" | "get_site" | "list_candidates" | "list_courses" | "get_policy";
  expectPress?: "ask" | "enroll_course";
  forbidCarousel?: boolean;
  scripted?: boolean;
};

/** The questions a Cop demo actually gets asked, one per card shape and per persona scope. */
export const EVAL_CASES: EvalCase[] = [
  { scripted: true, id: "ceo-attainment", userId: "u_thana", prompt: "ยอดขายทั้งประเทศเทียบเป้าตอนนี้เท่าไหร่", expectComponent: "DataCard" },
  { scripted: true, id: "ceo-by-region", userId: "u_thana", prompt: "ยอดขายแยกตามภาคเดือนนี้", expectComponent: "DataCard", expectSort: "value_desc" },
  { scripted: true, id: "ceo-decline", userId: "u_thana", prompt: "เอเย่นต์ไหนยอดตกแรงที่สุดเทียบงวดก่อน", expectComponent: "DataCard", expectSort: "delta_asc" },
  { scripted: true, id: "ceo-trend", userId: "u_thana", prompt: "แนวโน้มยอดขายรายเดือนปีนี้เป็นยังไง", expectComponent: "DataCard" },
  { scripted: true, id: "ceo-alerts", userId: "u_thana", prompt: "ตอนนี้มีอะไรผิดปกติบ้าง", expectComponent: "AlertsCard" },
  { id: "cfo-ar", userId: "u_siriporn", prompt: "ลูกหนี้ค้างชำระตอนนี้แยกตามภาค", expectComponent: "DataCard", expectSort: "value_desc" },
  { scripted: true, id: "cfo-masked", userId: "u_siriporn", prompt: "เงินเดือนเฉลี่ยแต่ละฝ่ายเท่าไหร่", expectComponent: "DataCard" },
  { scripted: true, id: "rsm-own-region", userId: "u_anucha", prompt: "ยอดขายภาคอีสานเดือนนี้เทียบเป้า", expectComponent: "DataCard" },
  { scripted: true, id: "rsm-agents", userId: "u_anucha", prompt: "เอเย่นต์ในภาคผมที่ยอดตก", expectComponent: "DataCard", expectSort: "delta_asc" },
  { scripted: true, id: "planner-cover", userId: "u_wee", prompt: "ศูนย์กระจายสินค้าไหนสต๊อกจะขาดก่อน", expectComponent: "DataCard", expectSort: "value_asc" },
  { id: "planner-forecast", userId: "u_wee", prompt: "พยากรณ์ยอดขายอีก 8 สัปดาห์" },
  { id: "marketing-campaign", userId: "u_ben", prompt: "แคมเปญไหนได้ผลดีที่สุด", expectComponent: "DataCard", expectSort: "value_desc" },
  { id: "hr-attrition", userId: "u_may", prompt: "อัตราการลาออกแต่ละฝ่ายเป็นยังไง", expectComponent: "DataCard" },
  { id: "rep-denied", userId: "u_krit", prompt: "กำไรขั้นต้นของบริษัทเท่าไหร่" },
  { scripted: true, id: "hr-headcount", userId: "u_may", prompt: "จำนวนพนักงานแต่ละฝ่ายเทียบปีที่แล้ว", expectComponent: "DataCard", expectSort: "value_desc" },
  { scripted: true, id: "finance-budget", userId: "u_mint", prompt: "เปรียบเทียบงบกับยอดจริงของเดือนนี้", expectComponent: "DataCard" },
  { id: "landing-alert-marketing", userId: "u_ben", prompt: "ตรวจความผิดปกติของ เพอร์ร่า ขวด PET 600 มล. · เชียงใหม่ · ภาคเหนือ ให้หน่อย", expectComponent: "AlertsCard" },
  { id: "landing-alert-finance", userId: "u_mint", prompt: "ตรวจความผิดปกติของ ภาคใต้ ให้หน่อย", expectComponent: "AlertsCard" },
  { id: "landing-visit", userId: "u_krit", prompt: "เทียบยอดขายเข้ากับยอดขายออกของ อุบลศรีสุข เทรดดิ้ง ก่อนไปเยี่ยม", expectComponent: "DataCard" },
  { scripted: true, id: "ceo-channel", userId: "u_thana", prompt: "ขอยอดขายแยกตามช่องทางหน่อย", expectComponent: "DataCard", expectSort: "value_desc", expectShape: "share" },
  { scripted: true, id: "planner-watch", userId: "u_wee", prompt: "เตือนฉันถ้าสต๊อกดีซีลำพูนพอขายต่ำกว่า 10 วัน", expectApproval: "watch_metric" },
  { id: "compare-month-to-date", userId: "u_thana", prompt: "ยอดขายเดือนนี้เทียบเดือนก่อนเป็นยังไง", expectComponent: "DataCard", expectCompare: { compare: "prev_period", range: { from: "2026-09-01", to: "2026-09-22" } } },
  { id: "compare-top-decliners", userId: "u_thana", prompt: "10 เอเย่นต์ที่ยอดขายเดือนที่แล้วตกมากที่สุดเทียบเดือนก่อนหน้า", expectComponent: "DataCard", expectSort: "delta_asc", expectCompare: { compare: "prev_period", range: { from: "2026-08-01", to: "2026-08-31" } } },
  { id: "compare-stock-weekly", userId: "u_wee", prompt: "สต๊อกคงเหลือรายสัปดาห์ เทียบกับช่วงก่อนหน้า", expectComponent: "DataCard", expectCompare: { compare: "prev_period" } },
  { id: "compare-ar-last-year", userId: "u_siriporn", prompt: "ลูกหนี้ค้างชำระภาคใต้เดือนที่แล้ว แยกตามเอเย่นต์ เทียบช่วงเดียวกันปีก่อน", expectComponent: "DataCard", expectCompare: { compare: "prev_year", range: { from: "2026-08-01", to: "2026-08-31" } } },
  { id: "rsm-watch-agent", userId: "u_anucha", prompt: "ถ้ายอดขายเข้าของ ส.รุ่งเรือง เทรดดิ้ง เปลี่ยนเกิน 15% ให้เตือนผมด้วย", expectApproval: "watch_metric" },
  { scripted: true, id: "shape-stacked", userId: "u_thana", prompt: "ยอดขายรายเดือนแยกภาค 6 เดือนล่าสุด", expectComponent: "DataCard", expectShape: "stacked" },
  { scripted: true, id: "shape-province", userId: "u_thana", prompt: "ยอดเทียบเป้ารายจังหวัดเดือนนี้", expectComponent: "DataCard", expectShape: "rank" },
  { scripted: true, id: "shape-heatmap", userId: "u_thana", prompt: "ยอดขายแต่ละภาคแยกช่องทาง เทียบเดือนก่อน", expectComponent: "DataCard", expectShape: "heatmap" },
  { scripted: true, id: "shape-funnel", userId: "u_thana", prompt: "เดือน ส.ค. ผลิตเบียร์ได้เท่าไหร่ ขายเข้าเท่าไหร่ ขายออกเท่าไหร่", expectComponent: "DataCard", expectShape: "funnel" },
  { scripted: true, id: "shape-scatter", userId: "u_thana", prompt: "เอเย่นต์ที่ขายมากค้างชำระมากด้วยไหม เดือน ส.ค.", expectComponent: "DataCard", expectShape: "scatter" },
  { scripted: true, id: "shape-sell-through", userId: "u_thana", prompt: "เทียบยอดขายเข้ากับยอดขายออกของเอเย่นต์", expectComponent: "DataCard", expectShape: "gap" },
  { id: "shape-share-market", userId: "u_anucha", prompt: "สัดส่วนตลาดเบียร์ในนครราชสีมาเดือน ส.ค. แต่ละผู้ผลิตได้เท่าไหร่", expectComponent: "DataCard", expectShape: "share" },
  { scripted: true, id: "people-team", userId: "u_anucha", prompt: "ทีมขายภาคอีสานมีใครบ้าง", expectPeople: "find_people", expectPress: "ask", forbidCarousel: true },
  { scripted: true, id: "people-certs", userId: "u_may", prompt: "ใบอนุญาตหรือใบรับรองของใครใกล้หมดอายุบ้าง", expectPeople: "find_people" },
  { scripted: true, id: "people-profile", userId: "u_may", prompt: "ขอดูโปรไฟล์คุณจอย ศรีประเสริฐ", expectPeople: "get_person" },
  { scripted: true, id: "sites-overview", userId: "u_thana", prompt: "โรงงานไหนเกิดอุบัติเหตุบ้าง", expectPeople: "get_site", expectPress: "ask", forbidCarousel: true },
  { scripted: true, id: "sites-detail", userId: "u_may", prompt: "ดูความปลอดภัยของโรงงานขอนแก่น", expectPeople: "get_site" },
  { scripted: true, id: "candidates-khonkaen", userId: "u_may", prompt: "ผู้สมัครพนักงานขายขอนแก่น", expectPeople: "list_candidates", forbidCarousel: true },
  { id: "candidates-manager", userId: "u_anucha", prompt: "ตำแหน่งที่ผมเปิดรับมีผู้สมัครกี่คน ใครน่าสนใจ", expectPeople: "list_candidates", forbidCarousel: true },
  { scripted: true, id: "courses-month", userId: "u_may", prompt: "มีหลักสูตรอะไรเปิดเดือนนี้", expectPeople: "list_courses", expectPress: "enroll_course" },
  { id: "courses-rep", userId: "u_krit", prompt: "มีอบรมอะไรที่ผมควรไปบ้าง", expectPeople: "list_courses", expectPress: "enroll_course" },
  { scripted: true, id: "policy-leave", userId: "u_krit", prompt: "ลาพักร้อนยังไง", expectPeople: "get_policy" },
  { id: "people-rep-scope", userId: "u_krit", prompt: "ทีมขายภาคอีสานมีใครบ้าง", expectPeople: "find_people" },
];

/** The subset the scripted mock answers, so the card contract is checked in `bun run test` with no API key. */
export const SCRIPTED_CASES = EVAL_CASES.filter((testCase) => testCase.scripted === true);
