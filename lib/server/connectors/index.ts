import { crmDemoConnector } from "./crm-demo";
import { lmsDemoConnector } from "./lms-demo";
import type { McpConnector } from "./types";

const CONFIGURED: McpConnector[] = [lmsDemoConnector, crmDemoConnector];

let registered: McpConnector[] | null = null;

function assertUniqueTools(connectors: McpConnector[]): void {
  const names = connectors.flatMap((connector) => connector.tools.map((tool) => tool.entry.name));
  const repeated = names.find((name, index) => names.indexOf(name) !== index);
  if (repeated) throw new Error(`connector tool ${repeated} is declared twice`);
}

/** The connectors to other systems on Winyu's surface, all MCP (a system without MCP gets a thin MCP server around its API): the configured ones, or the ones a test registered. */
export function remoteConnectors(): McpConnector[] {
  return registered ?? CONFIGURED;
}

export function registerConnectors(connectors: McpConnector[]): void {
  assertUniqueTools(connectors);
  registered = connectors;
}

export function resetConnectors(): void {
  registered = null;
}

export { defineMcpConnector } from "./define";
export type {
  McpConnector, McpConnectorConfig, McpToolConfig, ConnectorField, ConnectorScope, ConnectorRow, SensitiveField,
} from "./types";
