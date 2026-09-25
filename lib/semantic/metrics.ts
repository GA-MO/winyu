import { METRIC_IDS, type Dim, type MetricDef, type MetricId } from "@/lib/contracts";

export const REGION_SCOPE_DIMS: readonly Dim[] = ["region", "province", "agent", "dc", "plant"];
export const BRAND_SCOPE_DIMS: readonly Dim[] = ["brand", "sku", "business_unit"];
export const TIME_DIMS: readonly Dim[] = ["date", "week", "month"];

const SALES_DIMS: Dim[] = ["date", "week", "month", "region", "province", "channel", "brand", "sku", "pack", "agent", "business_unit"];
const INVENTORY_DIMS: Dim[] = ["date", "week", "month", "region", "dc", "brand", "sku", "pack", "business_unit"];
const PRODUCTION_DIMS: Dim[] = ["date", "week", "month", "region", "plant", "brand", "business_unit"];
const CAMPAIGN_DIMS: Dim[] = ["date", "week", "month", "campaign", "brand", "region", "business_unit"];
const SOV_DIMS: Dim[] = ["week", "month", "brand"];
const FINANCE_DIMS: Dim[] = ["month", "business_unit", "region"];
const AR_DIMS: Dim[] = ["month", "agent", "province", "region"];
const HR_DIMS: Dim[] = ["month", "department"];
const ACCURACY_DIMS: Dim[] = ["month", "brand", "region"];

const VOLUME_WORDS = ["ยอดขาย", "ปริมาณ", "ลัง", "โหล", "ลิตร", "เฮกโตลิตร", "HL", "volume"];

function aclDimsOf(dims: Dim[]): Dim[] {
  return dims.filter((dim) => REGION_SCOPE_DIMS.includes(dim) || BRAND_SCOPE_DIMS.includes(dim));
}

type MetricSeed = Omit<MetricDef, "aclDims">;

const SEEDS: readonly MetricSeed[] = [
  {
    id: "net_sales_volume", label: "Net sales volume", labelTh: "ปริมาณขายเข้า (Sell-in)", unit: "ลิตร", format: "number",
    owner: "u_prasit", certified: true, dims: SALES_DIMS, sourceSystem: "SAP SD",
    synonyms: [...VOLUME_WORDS, "ขายเข้า", "sell-in", "sellin", "ยอดสั่งซื้อ", "เอเย่นต์", "ซับเอเย่นต์", "ตัวแทนจำหน่าย", "net sales volume", "ยอดขายเป็นลัง"],
    description: "ปริมาณสินค้าที่ขายเข้าเอเย่นต์และซับเอเย่นต์ นับเป็นลิตร คำนวณจากจำนวนลังคูณปริมาตรต่อลัง",
  },
  {
    id: "net_sales_value", label: "Net sales value", labelTh: "มูลค่าขายเข้า", unit: "บาท", format: "currency",
    owner: "u_prasit", certified: true, dims: SALES_DIMS, sourceSystem: "SAP SD",
    synonyms: ["มูลค่าขาย", "ยอดขายเป็นเงิน", "รายได้จากการขาย", "revenue", "net sales value", "บาท", "ยอดขาย"],
    description: "มูลค่าการขายเข้าเอเย่นต์ก่อนหักส่วนลดการค้า คิดจากราคาต่อลังคูณจำนวนลัง",
  },
  {
    id: "sell_out_volume", label: "Sell-out volume", labelTh: "ปริมาณขายออก (Sell-out)", unit: "ลิตร", format: "number",
    owner: "u_prasit", certified: true, dims: SALES_DIMS, sourceSystem: "SAP SD",
    synonyms: ["ขายออก", "sell-out", "sellout", "ยอดขายหน้าร้าน", "ยอดขายถึงผู้บริโภค", "ลิตร", "เฮกโตลิตร", "ลัง", "ยอดขาย"],
    description: "ปริมาณที่เอเย่นต์ขายออกสู่ร้านค้าและผู้บริโภค ตามหลังขายเข้าราว 3–10 วัน",
  },
  {
    id: "target_attainment", label: "Target attainment", labelTh: "การบรรลุเป้าหมาย", unit: "%", format: "percent",
    owner: "u_prasit", certified: true, dims: SALES_DIMS, sourceSystem: "SAP SD",
    synonyms: ["เทียบเป้า", "บรรลุเป้า", "เป้าหมาย", "achievement", "attainment", "% เป้า", "ทำได้กี่เปอร์เซ็นต์"],
    description: "อัตราส่วนปริมาณขายเข้าจริงต่อเป้าหมาย เป้าหมายคำนวณจากยอดเดือนเดียวกันปีก่อนคูณ 1.06",
  },
  {
    id: "stock_on_hand", label: "Stock on hand", labelTh: "สต๊อกคงเหลือ", unit: "ลัง", format: "number",
    owner: "u_wee", certified: true, dims: INVENTORY_DIMS, sourceSystem: "WMS",
    synonyms: ["สต๊อก", "สินค้าคงคลัง", "ของคงเหลือ", "inventory", "stock", "ลัง", "คลังสินค้า"],
    description: "สต๊อกคงเหลือปลายวันที่ศูนย์กระจายสินค้าแต่ละแห่ง นับเป็นลัง",
  },
  {
    id: "days_of_cover", label: "Days of cover", labelTh: "วันครอบคลุมสต๊อก", unit: "วัน", format: "number",
    owner: "u_wee", certified: true, dims: INVENTORY_DIMS, sourceSystem: "WMS",
    synonyms: ["วันครอบคลุม", "days of cover", "doc", "สต๊อกพอกี่วัน", "ของพอขายกี่วัน", "สต๊อก"],
    description: "สต๊อกคงเหลือหารด้วยยอดจ่ายออกเฉลี่ย 28 วัน บอกว่าของพอขายอีกกี่วัน",
  },
  {
    id: "production_output", label: "Production output", labelTh: "ปริมาณการผลิต", unit: "ลิตร", format: "number",
    owner: "u_oat", certified: true, dims: PRODUCTION_DIMS, sourceSystem: "MES",
    synonyms: ["การผลิต", "ผลิตได้", "output", "production", "โรงงาน", "สายการผลิต", "ลิตร", "เฮกโตลิตร"],
    description: "ปริมาณที่ผลิตได้จริงรายวันของแต่ละโรงงานและสายการผลิต นับเป็นลิตร",
  },
  {
    id: "capacity_utilization", label: "Capacity utilization", labelTh: "อัตราการใช้กำลังผลิต", unit: "%", format: "percent",
    owner: "u_oat", certified: true, dims: PRODUCTION_DIMS, sourceSystem: "MES",
    synonyms: ["ใช้กำลังผลิต", "utilization", "กำลังการผลิต", "capacity", "เดินเครื่อง"],
    description: "ปริมาณที่ผลิตได้จริงหารด้วยกำลังการผลิตสูงสุดของสายการผลิต",
  },
  {
    id: "forecast_mape", label: "Forecast MAPE", labelTh: "ความคลาดเคลื่อนพยากรณ์ (MAPE)", unit: "%", format: "percent",
    owner: "u_wee", certified: false, dims: ACCURACY_DIMS, sourceSystem: "Demand planning",
    synonyms: ["mape", "ความแม่นยำพยากรณ์", "forecast error", "พยากรณ์พลาด", "ความคลาดเคลื่อน"],
    description: "ค่าเฉลี่ยความคลาดเคลื่อนสัมบูรณ์เป็นเปอร์เซ็นต์ของการพยากรณ์อุปสงค์รายเดือน",
  },
  {
    id: "campaign_spend", label: "Campaign spend", labelTh: "งบแคมเปญที่ใช้", unit: "บาท", format: "currency",
    owner: "u_ben", certified: true, dims: CAMPAIGN_DIMS, sourceSystem: "SAP FI",
    synonyms: ["งบการตลาด", "ใช้งบ", "แคมเปญ", "campaign spend", "marketing spend", "งบโฆษณา"],
    description: "งบประมาณแคมเปญการตลาดที่ใช้จริงรายวัน",
  },
  {
    id: "campaign_reach", label: "Campaign reach", labelTh: "การเข้าถึงของแคมเปญ", unit: "คน", format: "number",
    owner: "u_ben", certified: false, dims: CAMPAIGN_DIMS, sourceSystem: "Ad platform",
    synonyms: ["reach", "เข้าถึง", "คนเห็นโฆษณา", "impression", "ยอดเข้าถึง"],
    description: "จำนวนผู้ที่เข้าถึงสื่อของแคมเปญรายวัน ประมาณจากแพลตฟอร์มโฆษณา",
  },
  {
    id: "campaign_uplift", label: "Campaign uplift", labelTh: "ยอดเพิ่มจากแคมเปญ", unit: "%", format: "percent",
    owner: "u_ben", certified: false, dims: CAMPAIGN_DIMS, sourceSystem: "SAP SD",
    synonyms: ["uplift", "ยอดเพิ่ม", "ผลของแคมเปญ", "โปรโมชันช่วยได้เท่าไร", "incremental"],
    description: "ส่วนต่างของยอดขายระหว่างช่วงแคมเปญกับเส้นฐาน คิดเป็นเปอร์เซ็นต์",
  },
  {
    id: "share_of_voice", label: "Share of voice", labelTh: "ส่วนแบ่งการพูดถึง", unit: "%", format: "percent",
    owner: "u_ben", certified: false, dims: SOV_DIMS, sourceSystem: "Social listening",
    synonyms: ["sov", "share of voice", "ส่วนแบ่งเสียง", "การพูดถึงแบรนด์", "คู่แข่ง"],
    description: "สัดส่วนการพูดถึงแบรนด์บนโซเชียลเทียบกับทั้งหมวด รวมคู่แข่ง A/B/C",
  },
  {
    id: "sentiment_score", label: "Sentiment score", labelTh: "คะแนนความรู้สึก", unit: "คะแนน", format: "number",
    owner: "u_ben", certified: false, dims: CAMPAIGN_DIMS, sourceSystem: "Social listening",
    synonyms: ["sentiment", "ความรู้สึก", "กระแส", "คนชอบไหม", "คะแนนกระแส"],
    description: "คะแนนความรู้สึกเฉลี่ยของการพูดถึงแคมเปญ ช่วง -1 ถึง 1",
  },
  {
    id: "gross_margin", label: "Gross margin", labelTh: "อัตรากำไรขั้นต้น", unit: "%", format: "percent",
    owner: "u_siriporn", certified: true, dims: FINANCE_DIMS, sourceSystem: "SAP FI",
    synonyms: ["gm", "กำไรขั้นต้น", "gross margin", "มาร์จิ้น", "อัตรากำไร"],
    description: "รายได้หักต้นทุนขายและภาษีสรรพสามิต หารด้วยรายได้ แยกตามหน่วยธุรกิจ",
  },
  {
    id: "trade_spend", label: "Trade spend", labelTh: "งบส่งเสริมการขาย", unit: "บาท", format: "currency",
    owner: "u_siriporn", certified: true, dims: FINANCE_DIMS, sourceSystem: "SAP FI",
    synonyms: ["trade spend", "งบเทรด", "ส่วนลดการค้า", "งบส่งเสริมการขาย", "ค่าใช้จ่ายการค้า"],
    description: "ค่าใช้จ่ายส่งเสริมการขายที่ให้กับช่องทางการค้า รวมงบแคมเปญและเส้นฐาน 3% ของรายได้",
  },
  {
    id: "ar_overdue", label: "AR overdue", labelTh: "ยอดค้างชำระเกินกำหนด", unit: "บาท", format: "currency",
    owner: "u_mint", certified: true, dims: AR_DIMS, sourceSystem: "SAP FI",
    synonyms: ["ค้างชำระ", "ลูกหนี้", "overdue", "ar", "หนี้ค้าง", "เครดิตเกินกำหนด", "เอเย่นต์"],
    description: "ยอดลูกหนี้การค้าที่เลยกำหนดชำระของเอเย่นต์แต่ละราย",
  },
  {
    id: "headcount", label: "Headcount", labelTh: "จำนวนพนักงาน", unit: "คน", format: "number",
    owner: "u_may", certified: true, dims: HR_DIMS, sourceSystem: "HRIS",
    synonyms: ["headcount", "จำนวนพนักงาน", "กำลังคน", "คนในทีม", "อัตรากำลัง"],
    description: "จำนวนพนักงานประจำสิ้นเดือนแยกตามฝ่าย",
  },
  {
    id: "attrition_rate", label: "Attrition rate", labelTh: "อัตราการลาออกต่อเดือน", unit: "%", format: "percent",
    owner: "u_may", certified: true, dims: HR_DIMS, sourceSystem: "HRIS",
    synonyms: ["attrition", "turnover", "ลาออก", "อัตราลาออก", "คนออก"],
    description: "สัดส่วนพนักงานที่ลาออกในเดือนนั้นต่อจำนวนพนักงานทั้งหมดของฝ่าย",
  },
  {
    id: "avg_salary", label: "Average salary", labelTh: "เงินเดือนเฉลี่ย", unit: "บาท", format: "currency",
    owner: "u_may", certified: true, dims: HR_DIMS, sourceSystem: "HRIS",
    synonyms: ["เงินเดือน", "salary", "ค่าจ้าง", "เงินเดือนเฉลี่ย", "payroll"],
    description: "เงินเดือนเฉลี่ยต่อคนต่อเดือนแยกตามฝ่าย เป็นข้อมูลที่ถูกปิดตามนโยบายสำหรับบทบาทส่วนใหญ่",
  },
  {
    id: "market_share", label: "Beer market share", labelTh: "ส่วนแบ่งตลาดเบียร์", unit: "%", format: "percent",
    owner: "u_prasit", certified: false, dims: ["month", "region", "province", "maker"], sourceSystem: "Retail audit รายเดือน",
    synonyms: ["ส่วนแบ่งตลาด", "market share", "มาร์เก็ตแชร์", "แชร์ตลาด", "เทียบคู่แข่ง", "คู่แข่ง", "ช้าง", "ไทยเบฟ", "คาราบาว", "ตะวันแดง"],
    description: "สัดส่วนปริมาณเบียร์ของแต่ละผู้ผลิตในตลาดรายจังหวัด จาก retail audit รายเดือน ข้อมูลล่าสุดคือเดือนที่ครบแล้ว ถ้าไม่ระบุผู้ผลิตจะเป็นส่วนแบ่งของบุญรอด",
  },
];

export const METRICS: Record<MetricId, MetricDef> = Object.fromEntries(
  SEEDS.map((seed) => [seed.id, { ...seed, aclDims: aclDimsOf(seed.dims) }]),
) as Record<MetricId, MetricDef>;

export const METRIC_LIST: readonly MetricDef[] = METRIC_IDS.map((id) => METRICS[id]);

/** Metrics reported once a month after the month closes (a retail audit): a card shows the last complete month, never a partial one. */
export const CLOSED_MONTH_METRICS: ReadonlySet<MetricId> = new Set<MetricId>(["market_share"]);

/** Metrics whose value is a ratio (numerator over a weight), so rolling rows up averages by weight instead of summing. */
export const RATIO_METRICS: ReadonlySet<MetricId> = new Set<MetricId>([
  "target_attainment", "days_of_cover", "capacity_utilization", "forecast_mape",
  "campaign_uplift", "share_of_voice", "sentiment_score", "gross_margin", "attrition_rate", "avg_salary", "headcount", "market_share",
]);

/** Metrics the warehouse keeps by month, so a comparison window is read in whole calendar months. */
export const MONTHLY_METRICS: ReadonlySet<MetricId> = new Set<MetricId>([
  "forecast_mape", "gross_margin", "trade_spend", "ar_overdue", "market_share", "headcount", "attrition_rate", "avg_salary",
]);

/** Metrics with a plan to compare against: sales targets, and production capacity for output. */
export const TARGET_METRICS: ReadonlySet<MetricId> = new Set<MetricId>(["net_sales_volume", "sell_out_volume", "net_sales_value", "production_output"]);

export function metricDef(id: string): MetricDef | null {
  return (METRICS as Record<string, MetricDef | undefined>)[id] ?? null;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function scoreMetric(def: MetricDef, needle: string): number {
  const haystack = [def.id, def.label, def.labelTh, ...def.synonyms].map(normalize);
  let score = 0;
  for (const term of haystack) {
    if (!term) continue;
    if (term === needle) score += 10;
    else if (needle.includes(term) && term.length >= 2) score += 4 + Math.min(3, term.length / 4);
    else if (term.includes(needle) && needle.length >= 2) score += 2;
  }
  if (normalize(def.description).includes(needle) && needle.length >= 3) score += 1;
  return score;
}

/** Metrics whose label or synonyms match the text, best match first. */
export function findMetric(text: string): MetricDef[] {
  const needle = normalize(text);
  if (!needle) return [...METRIC_LIST];
  return METRIC_LIST
    .map((def) => ({ def, score: scoreMetric(def, needle) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.def.id.localeCompare(right.def.id))
    .map((entry) => entry.def);
}

export function metricsOwnedBy(userId: string): MetricDef[] {
  return METRIC_LIST.filter((def) => def.owner === userId);
}
