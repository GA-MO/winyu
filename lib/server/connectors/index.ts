import { AsyncLocalStorage } from "node:async_hooks";
import { activeStoredConnectors } from "./stored";
import type { McpConnector } from "./types";

let registered: McpConnector[] | null = null;
const previewed = new AsyncLocalStorage<McpConnector>();

function assertUniqueTools(connectors: McpConnector[]): void {
  const names = connectors.flatMap((connector) => connector.tools.map((tool) => tool.entry.name));
  const repeated = names.find((name, index) => names.indexOf(name) !== index);
  if (repeated) throw new Error(`connector tool ${repeated} is declared twice`);
}

function withPreview(stored: McpConnector[]): McpConnector[] {
  const preview = previewed.getStore();
  return preview ? [...stored.filter((connector) => connector.def.id !== preview.def.id), preview] : stored;
}

/** The connectors to secondary systems an IT admin added in the console, all MCP: the live ones (plus the one a model check previews, inside that check only), or the ones a test registered. Systems Winyu has a capability for sit behind ports, not here. */
export function remoteConnectors(): McpConnector[] {
  return registered ?? withPreview(activeStoredConnectors());
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
