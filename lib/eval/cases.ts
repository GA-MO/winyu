export type EvalCase = {
  id: string;
  userId: string;
  prompt: string;
  expectSort?: "delta_asc" | "delta_desc" | "value_desc" | "value_asc";
  expectComponent?: "DataCard" | "AlertsCard";
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
  { scripted: true, id: "ceo-channel", userId: "u_thana", prompt: "ขอยอดขายแยกตามช่องทางหน่อย", expectComponent: "DataCard", expectSort: "value_desc" },
];

/** The subset the scripted mock answers, so the card contract is checked in `bun run test` with no API key. */
export const SCRIPTED_CASES = EVAL_CASES.filter((testCase) => testCase.scripted === true);
