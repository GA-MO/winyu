import { z } from "zod";

export type MetricId = "net_sales_volume" | "net_sales_value" | "sell_out_volume" | "target_attainment"
  | "stock_on_hand" | "days_of_cover" | "production_output" | "capacity_utilization" | "forecast_mape"
  | "campaign_spend" | "campaign_reach" | "campaign_uplift" | "share_of_voice" | "sentiment_score"
  | "gross_margin" | "trade_spend" | "ar_overdue" | "headcount" | "attrition_rate" | "avg_salary" | "market_share";
export type Dim = "date" | "week" | "month" | "region" | "province" | "channel" | "brand" | "sku" | "pack"
  | "agent" | "dc" | "plant" | "campaign" | "department" | "business_unit" | "maker";
export type Grain = "day" | "week" | "month";
export type MetricDef = { id: MetricId; label: string; labelTh: string; unit: string; format: "number" | "currency" | "percent";
  owner: string; certified: boolean; dims: Dim[]; aclDims: Dim[]; synonyms: string[]; description: string; sourceSystem: string };
export type MetricSort = "value_desc" | "value_asc" | "delta_asc" | "delta_desc";
export type ValueFilter = { op: "below" | "above"; value: number };
export type MetricQuery = { metric: MetricId; dims: Dim[]; filters: Partial<Record<Dim, string[]>>;
  range: { from: string; to: string }; grain: Grain; compare: "none" | "prev_period" | "prev_year" | "target"; limit: number | null; sort?: MetricSort | null; where?: ValueFilter | null };
export type MetricRow = Record<string, string | number | null>;
export type Provenance = { metric: MetricId; certified: boolean; sourceSystem: string; asOf: string; rowCount: number;
  filtersApplied: Partial<Record<Dim, string[]>>; filterLabels?: string[]; scopeApplied: Partial<Record<Dim, string[]>>; masked: string[]; trust: "verified" | "derived" | "estimated" };
/** Where a month still running ends against its target at the recent pace, formatted for the card and the model. */
export type MonthEndProjection = { recentDays: number; projected: string; monthTarget: string; attainment: string };
/** How many groups of a breakdown sit under the metric's deciding line, counted over every group in scope before the row cap. */
export type UnderLine = { line: number; count: number; of: number };
export type MetricHeadline = { aggregate: "sum" | "average"; value: string; periodLabel: string; rowCount: number;
  deltaPercent: number | null; compareLabel: string | null; compareNote: string | null; top: { label: string; value: string }[]; projection?: MonthEndProjection | null; underLine?: UnderLine | null };
export type MetricResult = { ok: true; rows: MetricRow[]; summary: string; headline: MetricHeadline; provenance: Provenance } | { ok: false; error: string; code: "PERMISSION_DENIED" | "UNKNOWN_METRIC" | "BAD_QUERY" };

export const METRIC_IDS = ["net_sales_volume", "net_sales_value", "sell_out_volume", "target_attainment",
  "stock_on_hand", "days_of_cover", "production_output", "capacity_utilization", "forecast_mape",
  "campaign_spend", "campaign_reach", "campaign_uplift", "share_of_voice", "sentiment_score",
  "gross_margin", "trade_spend", "ar_overdue", "headcount", "attrition_rate", "avg_salary", "market_share"] as const satisfies readonly MetricId[];
export const DIMS = ["date", "week", "month", "region", "province", "channel", "brand", "sku", "pack",
  "agent", "dc", "plant", "campaign", "department", "business_unit", "maker"] as const satisfies readonly Dim[];
export const GRAINS = ["day", "week", "month"] as const satisfies readonly Grain[];
export const COMPARE_MODES = ["none", "prev_period", "prev_year", "target"] as const;
export const METRIC_SORTS = ["value_desc", "value_asc", "delta_asc", "delta_desc"] as const satisfies readonly MetricSort[];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ROWS = 60;

export const metricIdSchema = z.enum(METRIC_IDS);
export const dimSchema = z.enum(DIMS);
export const grainSchema = z.enum(GRAINS);
const filterValuesSchema = z.preprocess((value) => (typeof value === "string" ? [value] : value), z.array(z.string()));
/** Filter values per dimension; a single value the model sends as a string is read as a list of one. */
export const dimFiltersSchema = z.partialRecord(dimSchema, filterValuesSchema);
export const metricQuerySchema = z.object({
  metric: metricIdSchema,
  dims: z.array(dimSchema),
  filters: dimFiltersSchema,
  range: z.object({ from: z.string().regex(ISO_DATE), to: z.string().regex(ISO_DATE) }),
  grain: grainSchema,
  compare: z.enum(COMPARE_MODES),
  limit: z.number().int().min(1).max(MAX_ROWS).nullable(),
  sort: z.enum(METRIC_SORTS).nullable().optional(),
  where: z.object({ op: z.enum(["below", "above"]), value: z.number() }).nullable().optional(),
}) satisfies z.ZodType<MetricQuery>;
