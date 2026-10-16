import { AsyncLocalStorage } from "node:async_hooks";
import { activeStoredConnectors } from "./stored";
import type { McpConnector } from "./types";

const previewed = new AsyncLocalStorage<McpConnector>();

function withPreview(stored: McpConnector[]): McpConnector[] {
  const preview = previewed.getStore();
  return preview ? [...stored.filter((connector) => connector.def.id !== preview.def.id), preview] : stored;
}

/** The connectors to secondary systems an IT admin added in the console, all MCP: the live ones (plus the one a model check previews, inside that check only). Systems Winyu has a capability for sit behind ports, not here. */
export function remoteConnectors(): McpConnector[] {
  return withPreview(activeStoredConnectors());
}

/** Runs work with one console connector on the surface as if it were live, for an admin's model check before it is turned on; nobody else's request sees it. */
export function withPreviewConnector<T>(connector: McpConnector, work: () => Promise<T>): Promise<T> {
  return previewed.run(connector, work);
}
