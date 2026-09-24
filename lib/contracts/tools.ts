import { z } from "zod";
import { REGIONS, ROLE_IDS, type RoleId } from "./identity";
import { widgetKindSchema } from "./dashboard";
import { urgencySchema } from "./handoff";
import { dimSchema, metricIdSchema, metricQuerySchema } from "./semantic";
import { watchMetricInputSchema } from "./watches";

export type ToolTier = "read" | "write" | "destructive";
export type ToolName = "query_metric" | "list_metrics" | "describe_entity" | "get_alerts" | "get_forecast" | "get_calendar" | "recall_memory"
  | "find_people" | "get_person" | "get_site" | "list_candidates" | "list_courses" | "get_policy" | "request_leave" | "enroll_course"
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
export const PEOPLE_FLAGS = ["new", "risk", "cert_expiring", "overtime", "retiring"] as const;
export type PeopleFlag = (typeof PEOPLE_FLAGS)[number];
export const findPeopleInputSchema = z.object({
  region: z.enum(REGIONS).nullable(),
  department: z.string().nullable(),
  manager: z.string().nullable(),
  query: z.string().nullable(),
  flag: z.enum(PEOPLE_FLAGS).nullable(),
});
export const getSiteInputSchema = z.object({ id: z.string().nullable(), name: z.string().nullable() });
export const getPersonInputSchema = z.object({ id: z.string().nullable(), name: z.string().nullable() });
export const CANDIDATE_STAGE_IDS = ["applied", "screening", "interview", "final", "offer"] as const;
export const listCandidatesInputSchema = z.object({ position: z.string().nullable(), stage: z.enum(CANDIDATE_STAGE_IDS).nullable() });
export const listCoursesInputSchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).nullable(), query: z.string().nullable() });
export const getPolicyInputSchema = z.object({ topic: z.enum(["leave", "benefits"]) });
export const requestLeaveInputSchema = z.object({
  kind: z.enum(["annual", "sick", "personal"]),
  from: z.string().regex(ISO_DATE),
  to: z.string().regex(ISO_DATE),
  reason: z.string().max(200),
});
export const enrollCourseInputSchema = z.object({ courseId: z.string().min(1) });
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
  { name: "find_people", tier: "read", roles: "all", input: findPeopleInputSchema },
  { name: "get_person", tier: "read", roles: "all", input: getPersonInputSchema },
  { name: "get_site", tier: "read", roles: "all", input: getSiteInputSchema },
  { name: "list_candidates", tier: "read", roles: "all", input: listCandidatesInputSchema },
  { name: "list_courses", tier: "read", roles: "all", input: listCoursesInputSchema },
  { name: "get_policy", tier: "read", roles: "all", input: getPolicyInputSchema },
  { name: "request_leave", tier: "write", roles: "all", input: requestLeaveInputSchema },
  { name: "enroll_course", tier: "write", roles: "all", input: enrollCourseInputSchema },
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
