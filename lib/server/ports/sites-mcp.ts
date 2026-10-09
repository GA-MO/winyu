import { mcpPortClient, type McpEndpoint } from "./mcp-port";
import { SITES_MCP_TOOLS } from "./sites-mcp-contract";
import type { SitesPort } from "./sites";

const CACHE_MS = 60_000;

/** The sites port as a client of the safety system's MCP server; sites and incidents are read once a minute at most. */
export function sitesMcpPort(endpoint: McpEndpoint): SitesPort {
  const ask = mcpPortClient({ port: "sites", connector: "sites", contract: SITES_MCP_TOOLS, cacheMs: CACHE_MS }, endpoint);
  return { load: () => ask("load_sites", {}) };
}
