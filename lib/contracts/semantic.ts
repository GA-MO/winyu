import { z } from "zod";
import type { GrantRef } from "./grant";

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
/** A period named the way people say it; the server turns it into dates against the business day and the last data day. */
export type MetricPeriod = "this_week" | "last_week" | "this_month" | "last_month" | "ytd" | "last_7_days" | "last_30_days";
export type MetricQuery = { metric: MetricId; dims: Dim[]; filters: Partial<Record<Dim, string[]>>;
  range: { from: string; to: string }; grain: Grain; compare: "none" | "prev_period" | "prev_year" | "target"; limit: number | null; sort?: MetricSort | null; where?: ValueFilter | null; period?: MetricPeriod | null };
/** How much of the asked window the warehouse holds: the window, the last day with data in it, its days and covered days, and the Thai line that names the gap (null when there is none). */
export type Coverage = { from: string; to: string; through: string; days: number; coveredDays: number; label: string | null };
export type MetricRow = Record<string, string | number | null>;
export type DimValues = Partial<Record<Dim, string[]>>;
/** A question as the engine read it: every filter value as its canonical id, the slice the caller's role added because the question left it open, and the Thai name of every value in both, in the same order. Code after the engine reads this, never the words the model wrote. */
export type ResolvedQuery = MetricQuery & { scopeApplied: DimValues; labels: DimValues };
export type Provenance = { metric: MetricId; certified: boolean; sourceSystem: string; asOf: string; rowCount: number;
  filterLabels?: string[]; masked: string[]; suppressedRows?: number; trust: "verified" | "derived" | "estimated"; grant?: GrantRef; coverage?: Coverage };
/** Where a month still running ends against its target at the recent pace, how much of the whole month's target is done so far, and what is left to reach it: the amount (`shortBy`, null once the target is met) and the line the model reads, formatted for the card and the model. */
export type MonthEndProjection = { recentDays: number; projected: string; monthTarget: string; attainment: string; attainmentToDate: string; shortBy: string | null; remaining: string };
/** How many groups of a breakdown sit under the metric's deciding line, counted over every group in scope before the row cap. */
export type UnderLine = { line: number; count: number; of: number };
export type MetricHeadline = { aggregate: "sum" | "average"; value: string; periodLabel: string; rowCount: number;
  deltaPercent: number | null; deltaPoints?: number | null; compareLabel: string | null; compareNote: string | null; top: { label: string; value: string }[]; projection?: MonthEndProjection | null; underLine?: UnderLine | null; asked?: string[] | null };
export type MetricResult = { ok: true; rows: MetricRow[]; summary: string; headline: MetricHeadline; provenance: Provenance; query: ResolvedQuery } | { ok: false; error: string; code: "PERMISSION_DENIED" | "UNKNOWN_METRIC" | "BAD_QUERY" | "CONNECTOR_UNAVAILABLE" };

export const METRIC_IDS = ["net_sales_volume", "net_sales_value", "sell_out_volume", "target_attainment",
  "stock_on_hand", "days_of_cover", "production_output", "capacity_utilization", "forecast_mape",
  "campaign_spend", "campaign_reach", "campaign_uplift", "share_of_voice", "sentiment_score",
  "gross_margin", "trade_spend", "ar_overdue", "headcount", "attrition_rate", "avg_salary", "market_share"] as const satisfies readonly MetricId[];
export const DIMS = ["date", "week", "month", "region", "province", "channel", "brand", "sku", "pack",
  "agent", "dc", "plant", "campaign", "department", "business_unit", "maker"] as const satisfies readonly Dim[];
export const GRAINS = ["day", "week", "month"] as const satisfies readonly Grain[];
export const COMPARE_MODES = ["none", "prev_period", "prev_year", "target"] as const;
export const METRIC_SORTS = ["value_desc", "value_asc", "delta_asc", "delta_desc"] as const satisfies readonly MetricSort[];
export const METRIC_PERIODS = ["this_week", "last_week", "this_month", "last_month", "ytd", "last_7_days", "last_30_days"] as const satisfies readonly MetricPeriod[];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** The most rows any tool hands the model; the model copies them into props, so the cap is part of the grounding contract. */
export const MAX_ROWS = 60;

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
  limit: z.number().int().min(1).max(MAX_ROWS).nullable().default(null),
  sort: z.enum(METRIC_SORTS).nullable().optional(),
  where: z.object({ op: z.enum(["below", "above"]), value: z.number() }).nullable().optional(),
  period: z.enum(METRIC_PERIODS).nullable().optional(),
}) satisfies z.ZodType<MetricQuery>;

/** What `query_metric` takes: a named period or explicit dates; the server resolves the period, so `range` may be left out when `period` is set. */
export const metricQueryInputSchema = metricQuerySchema.extend({
  range: z.object({ from: z.string().regex(ISO_DATE), to: z.string().regex(ISO_DATE) }).nullable().optional(),
  period: z.enum(METRIC_PERIODS).nullable().optional(),
});
export type MetricQueryInput = z.infer<typeof metricQueryInputSchema>;
