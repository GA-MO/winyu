import { z } from "zod";
import { REGIONS, ROLE_IDS, type RoleId } from "./identity";
import { widgetKindSchema } from "./dashboard";
import { urgencySchema } from "./handoff";
import { CANDIDATE_STAGES, LEAVE_KINDS } from "./records";
import { dimFiltersSchema, dimSchema, metricIdSchema, metricQuerySchema } from "./semantic";
import { watchMetricInputSchema } from "./watches";

export type ToolTier = "read" | "write" | "destructive";
export type NativeToolName = "query_metric" | "list_metrics" | "describe_entity" | "get_alerts" | "get_forecast" | "get_calendar" | "recall_memory"
  | "find_people" | "get_person" | "get_site" | "list_candidates" | "list_courses" | "get_policy" | "request_leave" | "enroll_course"
  | "resolve_owner" | "create_handoff" | "send_email" | "pin_widget" | "watch_metric" | "run_job" | "set_permission" | "explain_gap"
  | "ask_logistics_partner" | "search_documents";
export type ConnectorToolName = `${string}__${string}`;
export type ToolName = NativeToolName | ConnectorToolName;

export const NATIVE_CONNECTORS = ["warehouse", "hris", "lms", "leave", "sites", "calendar", "mail", "documents", "winyu", "logistics"] as const;
export type NativeConnectorId = (typeof NATIVE_CONNECTORS)[number];

export type ConnectorKind = "native" | "mcp" | "rest";

/** A system Winyu reaches tools through: its own ports (native) or a remote MCP server; what the admin groups tools under. */
export type ConnectorDef = { id: string; labelTh: string; sourceSystemTh: string; kind: ConnectorKind };

/** What the admin, the policy and the audit know about one tool; the executable lives on the server. */
export type ToolSurfaceEntry = { name: ToolName; connector: string; tier: ToolTier; roles: readonly RoleId[] | "all"; labelTh: string; bodyTh: string };

const MAX_FORECAST_WEEKS = 26;
const MAX_ALERTS = 60;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const ENTITY_KINDS = ["agent", "sku", "dc", "campaign", "user"] as const;
export const JOBS = ["anomaly", "forecast", "compose", "watches", "digest"] as const;

const metricScope = { metric: metricIdSchema, dims: z.partialRecord(dimSchema, z.string()) };

export const listMetricsInputSchema = z.object({ search: z.string().nullable() });
export const describeEntityInputSchema = z.object({ kind: z.enum(ENTITY_KINDS), query: z.string().min(1) });
export const getAlertsInputSchema = z.object({ status: z.enum(["open", "all"]), limit: z.number().int().min(1).max(MAX_ALERTS).nullable() });
export const getForecastInputSchema = z.object({ ...metricScope, weeks: z.number().int().min(1).max(MAX_FORECAST_WEEKS) });
export const explainGapInputSchema = z.object({
  metric: metricIdSchema,
  split: dimSchema,
  filters: dimFiltersSchema,
  range: z.object({ from: z.string().regex(ISO_DATE), to: z.string().regex(ISO_DATE) }),
  compare: z.enum(["target", "prev_period", "prev_year"]),
});
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
export const listCandidatesInputSchema = z.object({ position: z.string().nullable(), stage: z.enum(CANDIDATE_STAGES).nullable() });
export const listCoursesInputSchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).nullable(), query: z.string().nullable() });
export const getPolicyInputSchema = z.object({ topic: z.enum(["leave", "benefits"]) });
export const requestLeaveInputSchema = z.object({
  kind: z.enum(LEAVE_KINDS),
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
export const PERMISSION_KINDS = ["metric", "tool", "field"] as const;
export const PERMISSION_VALUES = ["full", "masked", "none", "allow", "deny"] as const;
export const setPermissionInputSchema = z.object({
  role: z.enum(ROLE_IDS),
  kind: z.enum(PERMISSION_KINDS),
  key: z.string().min(1),
  value: z.enum(PERMISSION_VALUES),
});

/** Whether a surface entry is on for a role before any admin override. */
export function toolRolesInclude(entry: Pick<ToolSurfaceEntry, "roles">, role: RoleId): boolean {
  return entry.roles === "all" || entry.roles.includes(role);
}
