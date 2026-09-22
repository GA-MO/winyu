import type { MetricId } from "@/lib/contracts";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";

export type MetricFormat = "number" | "currency" | "percent";

const FORMATS: Record<MetricId, MetricFormat> = {
  net_sales_volume: "number",
  net_sales_value: "currency",
  sell_out_volume: "number",
  target_attainment: "percent",
  stock_on_hand: "number",
  days_of_cover: "number",
  production_output: "number",
  capacity_utilization: "percent",
  forecast_mape: "percent",
  campaign_spend: "currency",
  campaign_reach: "number",
  campaign_uplift: "percent",
  share_of_voice: "percent",
  sentiment_score: "number",
  gross_margin: "percent",
  trade_spend: "currency",
  ar_overdue: "currency",
  headcount: "number",
  attrition_rate: "percent",
  avg_salary: "currency",
};

const UNITS: Record<MetricId, string> = {
  net_sales_volume: "ลัง",
  net_sales_value: "บาท",
  sell_out_volume: "ลัง",
  target_attainment: "%",
  stock_on_hand: "ลัง",
  days_of_cover: "วัน",
  production_output: "เฮกโตลิตร",
  capacity_utilization: "%",
  forecast_mape: "%",
  campaign_spend: "บาท",
  campaign_reach: "คน",
  campaign_uplift: "%",
  share_of_voice: "%",
  sentiment_score: "คะแนน",
  gross_margin: "%",
  trade_spend: "บาท",
  ar_overdue: "บาท",
  headcount: "คน",
  attrition_rate: "%",
  avg_salary: "บาท",
};

const SOURCE_SYSTEMS: Record<MetricId, string> = {
  net_sales_volume: "SAP SD",
  net_sales_value: "SAP SD",
  sell_out_volume: "DMS",
  target_attainment: "SAP SD",
  stock_on_hand: "WMS",
  days_of_cover: "WMS",
  production_output: "MES",
  capacity_utilization: "MES",
  forecast_mape: "Planning",
  campaign_spend: "Media Hub",
  campaign_reach: "Media Hub",
  campaign_uplift: "Media Hub",
  share_of_voice: "Social Listening",
  sentiment_score: "Social Listening",
  gross_margin: "SAP FI",
  trade_spend: "SAP FI",
  ar_overdue: "SAP FI",
  headcount: "HRIS",
  attrition_rate: "HRIS",
  avg_salary: "HRIS",
};

const CERTIFIED: readonly MetricId[] = [
  "net_sales_volume", "net_sales_value", "sell_out_volume", "target_attainment",
  "stock_on_hand", "days_of_cover", "production_output", "gross_margin", "ar_overdue", "headcount",
];

export function metricLabel(metric: MetricId): string {
  return TH.metric[metric];
}

export function metricFormat(metric: MetricId): MetricFormat {
  return FORMATS[metric];
}

export function metricUnit(metric: MetricId): string {
  return UNITS[metric];
}

export function metricSource(metric: MetricId): string {
  return SOURCE_SYSTEMS[metric];
}

export function isCertified(metric: MetricId): boolean {
  return CERTIFIED.includes(metric);
}

/** A metric value as the user reads it: number with unit, บาท for money, % for ratios, `***` when masked. */
export function formatMetricValue(metric: MetricId, value: number | string | null): string {
  const format = FORMATS[metric];
  if (format === "currency") return formatCurrency(value);
  if (format === "percent") return formatPercent(value);
  const unit = UNITS[metric];
  const formatted = formatNumber(value);
  return unit && formatted !== "—" ? `${formatted} ${unit}` : formatted;
}
