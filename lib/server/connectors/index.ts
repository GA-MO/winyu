import { crmDemoConnector } from "./crm-demo";
import { lmsDemoConnector } from "./lms-demo";
import type { McpConnector, RemoteConnector } from "./types";

const CONFIGURED: RemoteConnector[] = [lmsDemoConnector, crmDemoConnector];

let registered: RemoteConnector[] | null = null;

function assertUniqueTools(connectors: RemoteConnector[]): void {
  const names = connectors.flatMap((connector) => connector.tools.map((tool) => tool.entry.name));
  const repeated = names.find((name, index) => names.indexOf(name) !== index);
  if (repeated) throw new Error(`connector tool ${repeated} is declared twice`);
}

/** The connectors to other systems on Winyu's surface, MCP and REST alike: the configured ones, or the ones a test registered. */
export function remoteConnectors(): RemoteConnector[] {
  return registered ?? CONFIGURED;
}

/** The MCP ones among them, whose tool catalogs Winyu reads and reconciles. */
export function mcpConnectors(): McpConnector[] {
  return remoteConnectors().filter((connector): connector is McpConnector => connector.def.kind === "mcp");
}

export function registerConnectors(connectors: RemoteConnector[]): void {
  assertUniqueTools(connectors);
  registered = connectors;
}

export function resetConnectors(): void {
  registered = null;
}

export { defineMcpConnector, defineRestConnector } from "./define";
export type {
  McpConnector, McpConnectorConfig, McpToolConfig, RestConnector, RestConnectorConfig, RestToolConfig, RemoteConnector,
  ConnectorField, ConnectorScope, ConnectorRow, SensitiveField,
} from "./types";
