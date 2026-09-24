import type { Tool } from "ai";
import { prefixedToolName } from "vexa/server";
import { NATIVE_CONNECTORS, type ConnectorDef, type RoleId, type ToolTier } from "@/lib/contracts";
import type { Visibility } from "@/lib/access/role-overrides";
import { withAudit } from "@/lib/server/audit";
import type { CopTool } from "@/lib/server/tools/define";
import { TH } from "@/lib/i18n/th";
import { callConnectorTool, executableOf } from "./call";
import type { ConnectorField, ConnectorToolBinding, McpConnector, McpConnectorConfig, McpToolConfig, SensitiveField } from "./types";

const CONNECTOR_ID = /^[a-z][a-z0-9_]{0,31}$/;
const REMOTE_TOOL_NAME = /^[A-Za-z0-9_.-]{1,64}$/;
const UNDECLARED_TIER: ToolTier = "destructive";

function fail(connector: string, message: string): never {
  throw new Error(`connector ${connector}: ${message}`);
}

function assertConnector(config: McpConnectorConfig) {
  if (!CONNECTOR_ID.test(config.id)) fail(config.id, `id must match ${CONNECTOR_ID}`);
  if ((NATIVE_CONNECTORS as readonly string[]).includes(config.id)) fail(config.id, "id is taken by a native connector");
  if (Object.keys(config.tools).length === 0) fail(config.id, "opens no tools");
  if (!(config.timeoutMs > 0)) fail(config.id, "needs a timeoutMs");
}

function assertTool(connector: string, remoteName: string, tool: McpToolConfig) {
  if (!REMOTE_TOOL_NAME.test(remoteName)) fail(connector, `tool name "${remoteName}" is not a single remote tool`);
  if (!tool.roles) fail(connector, `tool ${remoteName} declares no roles`);
  if (!tool.scope) fail(connector, `tool ${remoteName} declares no scope`);
  if (!("kind" in tool.scope) && tool.scope.length === 0) fail(connector, `tool ${remoteName} has an empty scope`);
  if ("kind" in tool.scope && !tool.scope.reason) fail(connector, `tool ${remoteName} says scope none without a reason`);
}

function includes(roles: readonly RoleId[] | "all" | undefined, role: RoleId): boolean {
  return roles === "all" || (roles ?? []).includes(role);
}

function fieldOf(connector: string, sensitive: SensitiveField): ConnectorField {
  const defaultFor = (role: RoleId): Visibility => (includes(sensitive.full, role) ? "full" : includes(sensitive.masked, role) ? "masked" : "none");
  return { key: `${connector}.${sensitive.field}`, connector, field: sensitive.field, labelTh: sensitive.labelTh, defaultFor };
}

function bindingOf(config: McpConnectorConfig, remoteName: string, tool: McpToolConfig): ConnectorToolBinding {
  assertTool(config.id, remoteName, tool);
  const fields = (tool.sensitive ?? []).map((sensitive) => fieldOf(config.id, sensitive));
  return { name: prefixedToolName(config.id, tool.as ?? remoteName), remoteName, tier: tool.tier ?? UNDECLARED_TIER, config: tool, fields };
}

function copToolOf(connector: McpConnectorConfig, binding: ConnectorToolBinding): CopTool {
  const entry = {
    name: binding.name as CopTool["entry"]["name"],
    connector: connector.id,
    tier: binding.tier,
    roles: binding.config.roles,
    labelTh: binding.config.labelTh,
    bodyTh: binding.config.bodyTh ?? TH.admin.connectors.toolBody(connector.sourceSystemTh),
  };
  const tool: Tool = executableOf(connector, binding, withAudit(binding.name, connector.id, (input: unknown) => callConnectorTool(connector, binding, input)));
  return { entry, tool };
}

function uniqueFields(fields: ConnectorField[]): ConnectorField[] {
  return [...new Map(fields.map((field) => [field.key, field])).values()];
}

/** One remote MCP server on Cop's surface: only the tools named here, each with the tier, roles, scope and sensitive fields Cop declares; throws on anything left undeclared. */
export function defineMcpConnector(config: McpConnectorConfig): McpConnector {
  assertConnector(config);
  const bindings = Object.entries(config.tools).map(([remoteName, tool]) => bindingOf(config, remoteName, tool));
  const def: ConnectorDef = { id: config.id, labelTh: config.labelTh, sourceSystemTh: config.sourceSystemTh, kind: "mcp" };
  return { def, config, tools: bindings.map((binding) => copToolOf(config, binding)), fields: uniqueFields(bindings.flatMap((binding) => binding.fields)) };
}
