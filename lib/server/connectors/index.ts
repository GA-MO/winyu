import { lmsDemoConnector } from "./lms-demo";
import type { McpConnector } from "./types";

const CONFIGURED: McpConnector[] = [lmsDemoConnector];

let registered: McpConnector[] | null = null;

function assertUniqueTools(connectors: McpConnector[]): void {
  const names = connectors.flatMap((connector) => connector.tools.map((tool) => tool.entry.name));
  const repeated = names.find((name, index) => names.indexOf(name) !== index);
  if (repeated) throw new Error(`connector tool ${repeated} is declared twice`);
}

/** The MCP connectors on Cop's surface: the configured ones, or the ones a test registered. */
export function mcpConnectors(): McpConnector[] {
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
export type { McpConnector, McpConnectorConfig, McpToolConfig, ConnectorField, ConnectorScope, ConnectorRow, SensitiveField } from "./types";
