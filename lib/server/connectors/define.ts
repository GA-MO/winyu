import { prefixedToolName } from "@/lib/harness/adapters/vexa/server";
import { NATIVE_CONNECTORS, type ConnectorDef, type RoleId, type ToolTier } from "@/lib/contracts";
import type { Visibility } from "@/lib/access/role-overrides";
import { engineTool } from "@/lib/harness/adapters/vexa/tools";
import { asksApproval, gated } from "@/lib/harness/gateway";
import { LIMITS } from "@/lib/harness/limits";
import type { Capability } from "@/lib/harness/types";
import type { WinyuTool } from "@/lib/server/tools/define";
import { TH } from "@/lib/i18n/th";
import { callConnectorTool, descriptionOf, inputSchemaOf, mcpCaller } from "./call";
import { placeholdersOf, restCaller } from "./rest";
import type {
  ConnectorField, ConnectorIdentity, ConnectorToolBinding, ConnectorToolConfig, McpConnector, McpConnectorConfig, McpToolConfig,
  RemoteCaller, RestConnector, RestConnectorConfig, RestToolConfig, SensitiveField,
} from "./types";

const CONNECTOR_ID = /^[a-z][a-z0-9_]{0,31}$/;
const REMOTE_TOOL_NAME = /^[A-Za-z0-9_.-]{1,64}$/;
const UNDECLARED_TIER: ToolTier = "destructive";
const REST_METHODS = ["GET", "POST"];
const HTTP_URL = /^https?:\/\/[^/]+/;
const REST_PATH = /^\/(?!\/)[^?#]*$/;

function fail(connector: string, message: string): never {
  throw new Error(`connector ${connector}: ${message}`);
}

function assertConnector(config: McpConnectorConfig | RestConnectorConfig) {
  if (!CONNECTOR_ID.test(config.id)) fail(config.id, `id must match ${CONNECTOR_ID}`);
  if ((NATIVE_CONNECTORS as readonly string[]).includes(config.id)) fail(config.id, "id is taken by a native connector");
  if (Object.keys(config.tools).length === 0) fail(config.id, "opens no tools");
  if (!(config.timeoutMs > 0)) fail(config.id, "needs a timeoutMs");
}

function assertTool(connector: string, remoteName: string, tool: ConnectorToolConfig) {
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

function assertRestTool(connector: string, name: string, tool: RestToolConfig) {
  if (!REST_METHODS.includes(tool.method)) fail(connector, `tool ${name} uses method ${tool.method}; only GET and POST`);
  if (!REST_PATH.test(tool.path)) fail(connector, `tool ${name} path must start with one "/" and carry no query`);
  if (!tool.description) fail(connector, `tool ${name} needs a description: a REST API has no catalog to read one from`);
  if (!tool.input) fail(connector, `tool ${name} needs an input schema`);
  if (!tool.output) fail(connector, `tool ${name} needs an output adapter`);
  const missing = placeholdersOf(tool.path).filter((placeholder) => !(placeholder in tool.input.shape));
  if (missing.length > 0) fail(connector, `tool ${name} path fills {${missing.join("}, {")}} that its input does not declare`);
}

function bindingOf<Config extends ConnectorToolConfig>(connector: string, remoteName: string, tool: Config, as: string | undefined): ConnectorToolBinding<Config> {
  assertTool(connector, remoteName, tool);
  const fields = (tool.sensitive ?? []).map((sensitive) => fieldOf(connector, sensitive));
  return { name: prefixedToolName(connector, as ?? remoteName), remoteName, tier: tool.tier ?? UNDECLARED_TIER, config: tool, fields };
}

function winyuToolOf(connector: ConnectorIdentity & { timeoutMs: number }, binding: ConnectorToolBinding, call: RemoteCaller): WinyuTool {
  const entry = {
    name: binding.name as WinyuTool["entry"]["name"],
    connector: connector.id,
    tier: binding.tier,
    roles: binding.config.roles,
    labelTh: binding.config.labelTh,
    bodyTh: binding.config.bodyTh ?? TH.admin.connectors.toolBody(connector.sourceSystemTh),
  };
  const capability: Capability = { ...entry, timeoutMs: connector.timeoutMs + LIMITS.toolTimeoutMs, verify: null, correct: null, redact: [] };
  const tool = engineTool({
    capability,
    description: () => descriptionOf(connector, binding),
    inputSchema: () => inputSchemaOf(connector, binding),
    asksApproval: (input) => asksApproval(capability, input),
    execute: gated(capability, (input: unknown) => callConnectorTool(connector, binding, input, call)),
  });
  return { entry, capability, tool };
}

function uniqueFields(fields: ConnectorField[]): ConnectorField[] {
  return [...new Map(fields.map((field) => [field.key, field])).values()];
}

/** One remote MCP server on Winyu's surface: only the tools named here, each with the tier, roles, scope and sensitive fields Winyu declares; throws on anything left undeclared. */
export function defineMcpConnector(config: McpConnectorConfig): McpConnector {
  assertConnector(config);
  const bindings = Object.entries(config.tools).map(([remoteName, tool]) => bindingOf<McpToolConfig>(config.id, remoteName, tool, tool.as));
  const def: ConnectorDef & { kind: "mcp" } = { id: config.id, labelTh: config.labelTh, sourceSystemTh: config.sourceSystemTh, kind: "mcp" };
  const tools = bindings.map((binding) => winyuToolOf(config, binding, mcpCaller(config, binding)));
  return { def, config, tools, fields: uniqueFields(bindings.flatMap((binding) => binding.fields)) };
}

/** One REST API on Winyu's surface through the same pipeline as MCP: only the endpoints named here, each with Winyu's own description, input schema, adapter, tier, roles, scope and sensitive fields. */
export function defineRestConnector(config: RestConnectorConfig): RestConnector {
  assertConnector(config);
  if (!HTTP_URL.test(config.baseUrl)) fail(config.id, "baseUrl must be an http(s) URL");
  const bindings = Object.entries(config.tools).map(([name, tool]) => {
    assertRestTool(config.id, name, tool);
    return bindingOf<RestToolConfig>(config.id, name, tool, undefined);
  });
  const def: ConnectorDef & { kind: "rest" } = { id: config.id, labelTh: config.labelTh, sourceSystemTh: config.sourceSystemTh, kind: "rest" };
  const tools = bindings.map((binding) => winyuToolOf(config, binding, restCaller(config, binding)));
  return { def, config, tools, fields: uniqueFields(bindings.flatMap((binding) => binding.fields)) };
}
