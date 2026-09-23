export type EvalCase = {
  id: string;
  userId: string;
  prompt: string;
  expectSort?: "delta_asc" | "delta_desc" | "value_desc" | "value_asc";
  expectComponent?: "DataCard" | "AlertsCard";
  expectApproval?: "watch_metric" | "create_handoff" | "pin_widget";
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
  { scripted: true, id: "ceo-channel", userId: "u_thana", prompt: "ขอยอดขายแยกตามช่องทางหน่อย", expectComponent: "DataCard", expectSort: "value_desc" },
  { scripted: true, id: "planner-watch", userId: "u_wee", prompt: "เตือนฉันถ้าสต๊อกดีซีลำพูนพอขายต่ำกว่า 10 วัน", expectApproval: "watch_metric" },
  { id: "rsm-watch-agent", userId: "u_anucha", prompt: "ถ้ายอดขายเข้าของ ส.รุ่งเรือง เทรดดิ้ง เปลี่ยนเกิน 15% ให้เตือนผมด้วย", expectApproval: "watch_metric" },
];

/** The subset the scripted mock answers, so the card contract is checked in `bun run test` with no API key. */
export const SCRIPTED_CASES = EVAL_CASES.filter((testCase) => testCase.scripted === true);
