import type { AccessContext, Dim, Grain, MetricId, MetricQuery, RoleId, WidgetKind, WidgetSort, WidgetSpec } from "@/lib/contracts";

export type WidgetSeed = { key: string; title: string; kind: WidgetKind; query: MetricQuery; sortBy: WidgetSort | null; pinned: boolean; source: WidgetSpec["source"]; reason: string | null };

const TODAY = "2026-09-22";
const MONTH_TO_DATE = { from: "2026-09-01", to: TODAY };
const LAST_4_WEEKS = { from: "2026-08-25", to: TODAY };
const LAST_QUARTER = { from: "2026-07-01", to: TODAY };
const LAST_6_MONTHS = { from: "2026-04-01", to: TODAY };
const YEAR_TO_DATE = { from: "2026-01-01", to: TODAY };
const LAST_AUDITED_MONTH = { from: "2026-08-01", to: "2026-08-31" };
const TOP_ROWS = 8;

type SeedInput = {
  key: string;
  title: string;
  kind: WidgetKind;
  metric: MetricId;
  dims?: Dim[];
  range?: MetricQuery["range"];
  grain?: Grain;
  compare?: MetricQuery["compare"];
  filters?: MetricQuery["filters"];
  limit?: number | null;
  sortBy?: WidgetSort;
  pinned?: boolean;
  source?: WidgetSpec["source"];
  reason?: string | null;
};

function seed(input: SeedInput): WidgetSeed {
  return {
    key: input.key,
    title: input.title,
    kind: input.kind,
    sortBy: input.sortBy ?? null,
    pinned: input.pinned ?? true,
    source: input.source ?? "role_template",
    reason: input.reason ?? null,
    query: {
      metric: input.metric,
      dims: input.dims ?? [],
      filters: input.filters ?? {},
      range: input.range ?? MONTH_TO_DATE,
      grain: input.grain ?? "month",
      compare: input.compare ?? "none",
      limit: input.limit ?? null,
    },
  };
}

const CEO_SEEDS: WidgetSeed[] = [
  seed({ key: "attainment", title: "ยอดขายทั้งประเทศเทียบเป้า", kind: "metric", metric: "target_attainment", compare: "none" }),
  seed({ key: "volume_trend", title: "ปริมาณขายรายเดือน", kind: "line", metric: "net_sales_volume", dims: ["month"], range: LAST_6_MONTHS, compare: "prev_year" }),
  seed({ key: "margin_bu", title: "กำไรขั้นต้นตามกลุ่มธุรกิจ", kind: "bar", metric: "gross_margin", dims: ["business_unit"], range: YEAR_TO_DATE }),
  seed({ key: "alerts", title: "ความผิดปกติที่ต้องดู", kind: "alert_list", metric: "sell_out_volume", dims: ["region"], range: LAST_4_WEEKS, grain: "week", compare: "prev_period" }),
  seed({ key: "ar", title: "ลูกหนี้ค้างชำระตามภาค", kind: "bar", metric: "ar_overdue", dims: ["region"], range: MONTH_TO_DATE, pinned: false, source: "role_template", reason: "ใช้ติดตามเงินที่ค้างจากเอเย่นต์" }),
];

const CFO_SEEDS: WidgetSeed[] = [
  seed({ key: "margin_trend", title: "กำไรขั้นต้นรายเดือน", kind: "line", metric: "gross_margin", dims: ["month"], range: LAST_6_MONTHS, compare: "prev_year" }),
  seed({ key: "value", title: "มูลค่าขายเดือนนี้", kind: "metric", metric: "net_sales_value", compare: "prev_period" }),
  seed({ key: "ar_region", title: "ลูกหนี้ค้างชำระตามภาค", kind: "bar", metric: "ar_overdue", dims: ["region"] }),
  seed({ key: "trade_spend", title: "งบส่งเสริมการขาย", kind: "kv", metric: "trade_spend", dims: ["region"], limit: TOP_ROWS }),
  seed({ key: "mape", title: "ความคลาดเคลื่อนพยากรณ์", kind: "metric", metric: "forecast_mape", pinned: false, source: "role_template", reason: "ใช้ดูว่าพยากรณ์แม่นแค่ไหนก่อนวางแผน" }),
];

const SALES_DIRECTOR_SEEDS: WidgetSeed[] = [
  seed({ key: "attainment_region", title: "ความสำเร็จต่อเป้าตามภาค", kind: "bar", metric: "target_attainment", dims: ["region"], compare: "none" }),
  seed({ key: "volume_trend", title: "ยอดขายออกจากร้านรายสัปดาห์", kind: "line", metric: "sell_out_volume", dims: ["week"], range: LAST_QUARTER, grain: "week", compare: "prev_year" }),
  seed({ key: "agents", title: "เอเย่นต์ที่ยอดตกมากที่สุด", kind: "bar", sortBy: "delta_asc", metric: "net_sales_volume", dims: ["agent"], range: LAST_4_WEEKS, grain: "week", compare: "prev_period", limit: TOP_ROWS }),
  seed({ key: "alerts", title: "ความผิดปกติในทีมขาย", kind: "alert_list", metric: "sell_out_volume", dims: ["region"], range: LAST_4_WEEKS, grain: "week", compare: "prev_period" }),
  seed({ key: "market_share", title: "ส่วนแบ่งตลาดเบียร์ตามภาค เทียบปีก่อน", kind: "bar", metric: "market_share", dims: ["region"], range: LAST_AUDITED_MONTH, grain: "month", compare: "prev_year", pinned: false, source: "role_template", reason: "ดูว่าภาคไหนเสียส่วนแบ่งให้คู่แข่ง" }),
];

const SALES_RSM_SEEDS: WidgetSeed[] = [
  seed({ key: "attainment_brand", title: "ยอดขายเทียบเป้าแยกตามแบรนด์", kind: "bar", metric: "target_attainment", dims: ["brand"], compare: "none" }),
  seed({ key: "falling_agents", title: "เอเย่นต์ที่ยอดตกเทียบไตรมาสก่อน", kind: "bar", sortBy: "delta_asc", metric: "net_sales_volume", dims: ["agent"], range: LAST_4_WEEKS, grain: "week", compare: "prev_period", limit: TOP_ROWS }),
  seed({ key: "sell_out", title: "ยอดขายออกจากร้านรายสัปดาห์", kind: "line", metric: "sell_out_volume", dims: ["week"], range: LAST_QUARTER, grain: "week", compare: "prev_year" }),
  seed({ key: "cover", title: "สินค้าที่สต๊อกพอขายน้อยที่สุด", kind: "kv", metric: "days_of_cover", dims: ["dc", "sku"], limit: TOP_ROWS }),
  seed({ key: "alerts", title: "ความผิดปกติในภาคของคุณ", kind: "alert_list", metric: "sell_out_volume", dims: ["agent"], range: LAST_4_WEEKS, grain: "week", compare: "prev_period", pinned: false, source: "role_template", reason: "ใช้ดูความผิดปกติในภาคของคุณที่เดียว" }),
  seed({ key: "market_share", title: "ส่วนแบ่งตลาดเบียร์ตามจังหวัด เทียบปีก่อน", kind: "bar", sortBy: "delta_asc", metric: "market_share", dims: ["province"], range: LAST_AUDITED_MONTH, grain: "month", compare: "prev_year", pinned: false, source: "role_template", reason: "ดูว่าจังหวัดไหนเสียส่วนแบ่งให้คู่แข่ง" }),
];

const SALES_REP_SEEDS: WidgetSeed[] = [
  seed({ key: "attainment", title: "ยอดขายของคุณเทียบเป้า", kind: "metric", metric: "target_attainment", compare: "none" }),
  seed({ key: "agents", title: "เอเย่นต์ที่คุณดูแล", kind: "table", metric: "net_sales_volume", dims: ["agent"], range: MONTH_TO_DATE, compare: "prev_period", limit: TOP_ROWS }),
  seed({ key: "stock", title: "สต๊อกคงเหลือตาม SKU", kind: "kv", metric: "stock_on_hand", dims: ["sku"], limit: TOP_ROWS }),
];

const MARKETING_SEEDS: WidgetSeed[] = [
  seed({ key: "campaign_spend", title: "งบแคมเปญที่ใช้ไป", kind: "bar", metric: "campaign_spend", dims: ["campaign"], range: YEAR_TO_DATE }),
  seed({ key: "uplift", title: "ผลยกระดับจากแคมเปญ", kind: "metric", metric: "campaign_uplift", compare: "prev_period" }),
  seed({ key: "sov", title: "ส่วนแบ่งเสียงรายสัปดาห์", kind: "line", metric: "share_of_voice", dims: ["week"], range: LAST_QUARTER, grain: "week" }),
  seed({ key: "sentiment", title: "คะแนนความรู้สึกตามแบรนด์", kind: "kv", metric: "sentiment_score", dims: ["brand"], limit: TOP_ROWS }),
  seed({ key: "sell_out", title: "ยอดขายออกจากร้านตามแบรนด์", kind: "bar", metric: "sell_out_volume", dims: ["brand"], range: LAST_4_WEEKS, grain: "week", pinned: false, source: "role_template", reason: "ใช้ดูว่าแคมเปญขายออกได้จริงไหม" }),
];

const SUPPLY_SEEDS: WidgetSeed[] = [
  seed({ key: "cover_dc", title: "สินค้าที่สต๊อกพอขายน้อยที่สุดตาม DC", kind: "table", metric: "days_of_cover", dims: ["dc", "sku"], limit: TOP_ROWS }),
  seed({ key: "production", title: "กำลังการผลิตตามโรงงาน", kind: "bar", metric: "production_output", dims: ["plant"], range: LAST_4_WEEKS, grain: "week", compare: "prev_period" }),
  seed({ key: "mape", title: "ความคลาดเคลื่อนพยากรณ์", kind: "metric", metric: "forecast_mape", compare: "prev_period" }),
  seed({ key: "capacity", title: "อัตราการใช้กำลังผลิตรายสัปดาห์", kind: "line", metric: "capacity_utilization", dims: ["week"], range: LAST_QUARTER, grain: "week" }),
  seed({ key: "sell_out", title: "ยอดขายออกจากร้านตาม SKU", kind: "kv", metric: "sell_out_volume", dims: ["sku"], limit: TOP_ROWS, pinned: false, source: "role_template", reason: "ใช้ประกอบการวางแผนผลิต" }),
];

const FINANCE_SEEDS: WidgetSeed[] = [
  seed({ key: "margin_bu", title: "กำไรขั้นต้นตามกลุ่มธุรกิจ", kind: "bar", metric: "gross_margin", dims: ["business_unit"], range: YEAR_TO_DATE }),
  seed({ key: "ar_agent", title: "ลูกหนี้ค้างชำระรายเอเย่นต์", kind: "table", metric: "ar_overdue", dims: ["agent"], limit: TOP_ROWS }),
  seed({ key: "trade_trend", title: "งบส่งเสริมการขายรายเดือน", kind: "line", metric: "trade_spend", dims: ["month"], range: LAST_6_MONTHS }),
  seed({ key: "value", title: "มูลค่าขายเดือนนี้", kind: "metric", metric: "net_sales_value", compare: "prev_year" }),
];

const HR_SEEDS: WidgetSeed[] = [
  seed({ key: "headcount", title: "จำนวนพนักงานทั้งหมด", kind: "metric", metric: "headcount", compare: "prev_year" }),
  seed({ key: "attrition_dept", title: "ฝ่ายที่ลาออกเพิ่มขึ้นเดือนล่าสุด", kind: "bar", metric: "attrition_rate", dims: ["department"], range: LAST_AUDITED_MONTH, compare: "prev_period", sortBy: "delta_desc" }),
  seed({ key: "attrition", title: "อัตราการลาออกรายเดือน", kind: "line", metric: "attrition_rate", dims: ["month"], range: LAST_6_MONTHS, pinned: false, reason: "ดูแนวโน้มการลาออก 6 เดือน" }),
  seed({ key: "salary", title: "เงินเดือนเฉลี่ยตามฝ่าย", kind: "kv", metric: "avg_salary", dims: ["department"], limit: TOP_ROWS }),
];

const IT_SEEDS: WidgetSeed[] = [
  seed({ key: "mape", title: "ความคลาดเคลื่อนพยากรณ์", kind: "metric", metric: "forecast_mape" }),
  seed({ key: "headcount_dept", title: "จำนวนผู้ใช้ตามฝ่าย", kind: "bar", metric: "headcount", dims: ["department"] }),
];

const ROLE_TEMPLATES: Record<RoleId, WidgetSeed[]> = {
  ceo: CEO_SEEDS,
  cfo: CFO_SEEDS,
  sales_director: SALES_DIRECTOR_SEEDS,
  sales_rsm: SALES_RSM_SEEDS,
  sales_rep: SALES_REP_SEEDS,
  marketing_lead: MARKETING_SEEDS,
  supply_planner: SUPPLY_SEEDS,
  finance_analyst: FINANCE_SEEDS,
  hr_manager: HR_SEEDS,
  it_admin: IT_SEEDS,
};

function scoped(seedItem: WidgetSeed, access: AccessContext): WidgetSeed {
  if (access.regions === "all" || access.regions.length === 0) return seedItem;
  return { ...seedItem, query: { ...seedItem.query, filters: { ...seedItem.query.filters, region: [...access.regions] } } };
}

/** The starting widgets for a role, with the caller's own region pushed into every query. */
export function templateFor(access: AccessContext): WidgetSeed[] {
  return ROLE_TEMPLATES[access.role].map((item) => scoped(item, access));
}

export const TEMPLATE_ROLES = Object.keys(ROLE_TEMPLATES) as RoleId[];
