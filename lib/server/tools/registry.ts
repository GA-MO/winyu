import type { ConnectorDef, NativeToolName, RoleId, ToolName, ToolSurfaceEntry } from "@/lib/contracts";
import { toolRolesInclude } from "@/lib/contracts";
import { remoteConnectors } from "@/lib/server/connectors";
import { nativeConnectors } from "@/lib/server/connectors/native";
import type { ConnectorField } from "@/lib/server/connectors/types";
import type { CopTool } from "./define";
import { queryMetricTool } from "./query-metric";
import { listMetricsTool } from "./list-metrics";
import { describeEntityTool } from "./describe-entity";
import { getAlertsTool } from "./get-alerts";
import { getForecastTool } from "./get-forecast";
import { getCalendarTool } from "./get-calendar";
import { recallMemoryTool } from "./recall-memory";
import { findPeopleTool } from "./find-people";
import { getPersonTool } from "./get-person";
import { getSiteTool } from "./get-site";
import { listCandidatesTool } from "./list-candidates";
import { listCoursesTool } from "./list-courses";
import { getPolicyTool } from "./get-policy";
import { requestLeaveTool } from "./request-leave";
import { enrollCourseTool } from "./enroll-course";
import { resolveOwnerTool } from "./resolve-owner";
import { createHandoffTool } from "./create-handoff";
import { sendEmailTool } from "./send-email";
import { pinWidgetTool } from "./pin-widget";
import { watchMetricTool } from "./watch-metric";
import { runJobTool } from "./run-job";
import { setPermissionTool } from "./set-permission";

/** The tools whose answers are metric rows, so what a role may call there depends on the metrics it sees. */
export const METRIC_READING_TOOLS: readonly ToolName[] = ["query_metric", "get_alerts", "get_forecast", "pin_widget", "watch_metric"];

const NATIVE_TOOLS: { [Name in NativeToolName]: CopTool<Name> } = {
  query_metric: queryMetricTool,
  list_metrics: listMetricsTool,
  describe_entity: describeEntityTool,
  get_alerts: getAlertsTool,
  get_forecast: getForecastTool,
  get_calendar: getCalendarTool,
  recall_memory: recallMemoryTool,
  find_people: findPeopleTool,
  get_person: getPersonTool,
  get_site: getSiteTool,
  list_candidates: listCandidatesTool,
  list_courses: listCoursesTool,
  get_policy: getPolicyTool,
  request_leave: requestLeaveTool,
  enroll_course: enrollCourseTool,
  resolve_owner: resolveOwnerTool,
  create_handoff: createHandoffTool,
  send_email: sendEmailTool,
  pin_widget: pinWidgetTool,
  watch_metric: watchMetricTool,
  run_job: runJobTool,
  set_permission: setPermissionTool,
};

function allTools(): CopTool[] {
  return [...Object.values(NATIVE_TOOLS), ...remoteConnectors().flatMap((connector) => connector.tools)];
}

/** Every system tools reach: Cop's own ports first, then each MCP connector, in the order the admin groups them. */
export function connectors(): ConnectorDef[] {
  return [...nativeConnectors(), ...remoteConnectors().map((connector) => connector.def)];
}

export type ConnectorGroup = { connector: ConnectorDef; tools: ToolSurfaceEntry[] };

/** The surface grouped under the connector each tool comes through, leaving out connectors with no tools. */
export function surfaceByConnector(): ConnectorGroup[] {
  const surface = toolSurface();
  return connectors()
    .map((connector) => ({ connector, tools: surface.filter((entry) => entry.connector === connector.id) }))
    .filter((group) => group.tools.length > 0);
}

export function connectorLabel(id: string): string {
  return connectors().find((connector) => connector.id === id)?.labelTh ?? id;
}

/** The names of every tool one connector puts on the surface. */
export function toolsOfConnector(connector: string): ToolName[] {
  return toolSurface().filter((entry) => entry.connector === connector).map((entry) => entry.name);
}

/** Every connector field only some roles see in full, keyed `${connector}.${field}`. */
export function connectorFields(): ConnectorField[] {
  return remoteConnectors().flatMap((connector) => connector.fields);
}

/** Every tool Cop can call, in the order the admin lists them: the one list the policy, the overrides, the kill switch and the audit read. */
export function toolSurface(): ToolSurfaceEntry[] {
  return allTools().map((item) => item.entry);
}

export function surfaceEntry(name: string): ToolSurfaceEntry | null {
  return allTools().find((item) => item.entry.name === name)?.entry ?? null;
}

export function isToolName(name: string): name is ToolName {
  return surfaceEntry(name) !== null;
}

/** The executable of one tool on the surface, or null for a name that is not on it. */
export function copTool(name: string): CopTool | null {
  return allTools().find((item) => item.entry.name === name) ?? null;
}

/** The tools a role has before any admin override, in surface order. */
export function defaultToolsOf(role: RoleId): ToolName[] {
  return toolSurface().filter((entry) => toolRolesInclude(entry, role)).map((entry) => entry.name);
}

/** The Thai label the admin and the audit show for a tool; the raw name for one no longer on the surface. */
export function toolLabel(name: string): string {
  return surfaceEntry(name)?.labelTh ?? name;
}

/** The Thai label the admin shows for a connector field; the raw key for one no longer declared. */
export function fieldLabel(key: string): string {
  return connectorFields().find((field) => field.key === key)?.labelTh ?? key;
}
