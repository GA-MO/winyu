import { AsyncLocalStorage } from "node:async_hooks";
import { CODE_CONNECTORS } from "./code";
import { activeStoredConnectors } from "./stored";
import type { McpConnector } from "./types";

let registered: McpConnector[] | null = null;
const previewed = new AsyncLocalStorage<McpConnector>();

function assertUniqueTools(connectors: McpConnector[]): void {
  const names = connectors.flatMap((connector) => connector.tools.map((tool) => tool.entry.name));
  const repeated = names.find((name, index) => names.indexOf(name) !== index);
  if (repeated) throw new Error(`connector tool ${repeated} is declared twice`);
}

/** The ids the code connectors hold, which no connector made in the admin console may take. */
export function codeConnectorIds(): string[] {
  return CODE_CONNECTORS.map((connector) => connector.def.id);
}

function withoutCodeIds(stored: McpConnector[]): McpConnector[] {
  const taken = new Set(codeConnectorIds());
  return stored.filter((connector) => !taken.has(connector.def.id));
}

function withPreview(stored: McpConnector[]): McpConnector[] {
  const preview = previewed.getStore();
  return preview ? [...stored.filter((connector) => connector.def.id !== preview.def.id), preview] : stored;
}

/** The connectors to other systems on Winyu's surface, all MCP (a system without MCP gets a thin MCP server around its API): the configured ones and the live ones an IT admin added in the console (plus the one a model check previews, inside that check only), or the ones a test registered. */
export function remoteConnectors(): McpConnector[] {
  return registered ?? [...CODE_CONNECTORS, ...withoutCodeIds(withPreview(activeStoredConnectors()))];
}

/** Runs work with one console connector on the surface as if it were live, for an admin's model check before it is turned on; nobody else's request sees it. */
export function withPreviewConnector<T>(connector: McpConnector, work: () => Promise<T>): Promise<T> {
  return previewed.run(connector, work);
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
