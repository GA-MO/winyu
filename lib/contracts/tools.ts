import { z } from "zod";
import { ROLE_IDS, type RoleId } from "./identity";
import { widgetKindSchema } from "./dashboard";
import { urgencySchema } from "./handoff";
import { dimSchema, metricIdSchema, metricQuerySchema } from "./semantic";
import { watchMetricInputSchema } from "./watches";

export type ToolTier = "read" | "write" | "destructive";
export type ToolName = "query_metric" | "list_metrics" | "describe_entity" | "get_alerts" | "get_forecast" | "get_calendar" | "recall_memory"
  | "resolve_owner" | "create_handoff" | "send_email" | "pin_widget" | "watch_metric" | "run_job" | "set_permission";
export type ToolSurfaceEntry = { name: ToolName; tier: ToolTier; roles: RoleId[] | "all"; input: z.ZodType };

const MAX_FORECAST_WEEKS = 26;
const MAX_ALERTS = 60;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ALL_BUT_SALES_REP: RoleId[] = ROLE_IDS.filter((role) => role !== "sales_rep");

export const ENTITY_KINDS = ["agent", "sku", "dc", "campaign", "user"] as const;
export const JOBS = ["anomaly", "forecast", "compose", "watches", "digest"] as const;

const metricScope = { metric: metricIdSchema, dims: z.partialRecord(dimSchema, z.string()) };

export const listMetricsInputSchema = z.object({ search: z.string().nullable() });
export const describeEntityInputSchema = z.object({ kind: z.enum(ENTITY_KINDS), query: z.string().min(1) });
export const getAlertsInputSchema = z.object({ status: z.enum(["open", "all"]), limit: z.number().int().min(1).max(MAX_ALERTS).nullable() });
export const getForecastInputSchema = z.object({ ...metricScope, weeks: z.number().int().min(1).max(MAX_FORECAST_WEEKS) });
export const getCalendarInputSchema = z.object({ from: z.string().regex(ISO_DATE).nullable(), to: z.string().regex(ISO_DATE).nullable() });
export const recallMemoryInputSchema = z.object({ query: z.string().min(1) });
export const resolveOwnerInputSchema = z.object(metricScope);
export const createHandoffInputSchema = z.object({
  toUserId: z.string().min(1),
  title: z.string().min(1),
  ask: z.string().min(1),
  urgency: urgencySchema,
  evidence: z.array(metricQuerySchema),
  alertIds: z.array(z.string()),
});
export const sendEmailInputSchema = z.object({ toUserId: z.string().min(1), subject: z.string().min(1), body: z.string().min(1) });
export const pinWidgetInputSchema = z.object({ title: z.string().min(1), kind: widgetKindSchema, query: metricQuerySchema });
export const runJobInputSchema = z.object({ job: z.enum(JOBS) });
export const PERMISSION_KINDS = ["metric", "tool"] as const;
export const PERMISSION_VALUES = ["full", "masked", "none", "allow", "deny"] as const;
export const setPermissionInputSchema = z.object({
  role: z.enum(ROLE_IDS),
  kind: z.enum(PERMISSION_KINDS),
  key: z.string().min(1),
  value: z.enum(PERMISSION_VALUES),
});

export const TOOL_SURFACE: readonly ToolSurfaceEntry[] = [
  { name: "query_metric", tier: "read", roles: "all", input: metricQuerySchema },
  { name: "list_metrics", tier: "read", roles: "all", input: listMetricsInputSchema },
  { name: "describe_entity", tier: "read", roles: "all", input: describeEntityInputSchema },
  { name: "get_alerts", tier: "read", roles: "all", input: getAlertsInputSchema },
  { name: "get_forecast", tier: "read", roles: "all", input: getForecastInputSchema },
  { name: "get_calendar", tier: "read", roles: "all", input: getCalendarInputSchema },
  { name: "recall_memory", tier: "read", roles: "all", input: recallMemoryInputSchema },
  { name: "resolve_owner", tier: "read", roles: "all", input: resolveOwnerInputSchema },
  { name: "create_handoff", tier: "write", roles: ALL_BUT_SALES_REP, input: createHandoffInputSchema },
  { name: "send_email", tier: "write", roles: ALL_BUT_SALES_REP, input: sendEmailInputSchema },
  { name: "pin_widget", tier: "write", roles: "all", input: pinWidgetInputSchema },
  { name: "watch_metric", tier: "write", roles: "all", input: watchMetricInputSchema },
  { name: "run_job", tier: "destructive", roles: ["it_admin"], input: runJobInputSchema },
  { name: "set_permission", tier: "destructive", roles: ["it_admin"], input: setPermissionInputSchema },
];

/** Tool names a role may call, in surface order. */
export function toolsAllowedFor(role: RoleId): ToolName[] {
  return TOOL_SURFACE.filter((entry) => entry.roles === "all" || entry.roles.includes(role)).map((entry) => entry.name);
}
