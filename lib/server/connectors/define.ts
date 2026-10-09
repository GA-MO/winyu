import { NATIVE_CONNECTORS, type ConnectorDef, type RoleId, type ToolTier } from "@/lib/contracts";
import type { Visibility } from "@/lib/access/role-overrides";
import { gated } from "@/lib/harness/gateway";
import { LIMITS } from "@/lib/harness/limits";
import type { Capability } from "@/lib/harness/types";
import type { WinyuTool } from "@/lib/server/tools/define";
import { TH } from "@/lib/i18n/th";
import { callConnectorTool, descriptionOf, inputSchemaOf } from "./call";
import type { ConnectorField, ConnectorToolBinding, McpConnector, McpConnectorConfig, McpToolConfig, SensitiveField } from "./types";

const CONNECTOR_ID = /^[a-z][a-z0-9_]{0,31}$/;
const REMOTE_TOOL_NAME = /^[A-Za-z0-9_.-]{1,64}$/;
const UNDECLARED_TIER: ToolTier = "destructive";

function prefixedToolName(connector: string, tool: string): string {
  return `${connector}__${tool.replace(/[^A-Za-z0-9_]/g, "_")}`;
}

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

function bindingOf(connector: string, remoteName: string, tool: McpToolConfig): ConnectorToolBinding {
  assertTool(connector, remoteName, tool);
  const fields = (tool.sensitive ?? []).map((sensitive) => fieldOf(connector, sensitive));
  return { name: prefixedToolName(connector, tool.as ?? remoteName), remoteName, tier: tool.tier ?? UNDECLARED_TIER, config: tool, fields };
}

function winyuToolOf(connector: McpConnectorConfig, binding: ConnectorToolBinding): WinyuTool {
  const entry = {
    name: binding.name as WinyuTool["entry"]["name"],
    connector: connector.id,
    tier: binding.tier,
    roles: binding.config.roles,
    labelTh: binding.config.labelTh,
    bodyTh: binding.config.bodyTh ?? TH.admin.connectors.toolBody(connector.sourceSystemTh),
  };
  const capability: Capability = { ...entry, timeoutMs: connector.timeoutMs + LIMITS.toolTimeoutMs, ready: null, verify: null, correct: null, redact: [] };
  return {
    entry,
    capability,
    description: () => descriptionOf(connector, binding),
    inputSchema: () => inputSchemaOf(connector, binding),
    execute: gated(capability, (input: unknown) => callConnectorTool(connector, binding, input)),
  };
}

function uniqueFields(fields: ConnectorField[]): ConnectorField[] {
  return [...new Map(fields.map((field) => [field.key, field])).values()];
}

/** One remote MCP server on Winyu's surface: only the tools named here, each with the tier, roles, scope and sensitive fields Winyu declares; throws on anything left undeclared. */
export function defineMcpConnector(config: McpConnectorConfig): McpConnector {
  assertConnector(config);
  const bindings = Object.entries(config.tools).map(([remoteName, tool]) => bindingOf(config.id, remoteName, tool));
  const def: ConnectorDef = { id: config.id, labelTh: config.labelTh, sourceSystemTh: config.sourceSystemTh, kind: "mcp" };
  const tools = bindings.map((binding) => winyuToolOf(config, binding));
  return { def, config, tools, fields: uniqueFields(bindings.flatMap((binding) => binding.fields)) };
}
