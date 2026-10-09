import { METRICS_MCP_TOOLS } from "./metrics-mcp-contract";
import { mcpPortClient, type McpEndpoint } from "./mcp-port";
import type { MetricsPort } from "./metrics";

const DEFAULT_CACHE_MS = 30_000;

export type MetricsMcpOptions = McpEndpoint & { cacheMs?: number };

/** The metrics port as a client of the data team's MCP server: each scoped request is one tool call, calls run in parallel, the same request within a short window is answered once, and any failure is a `PortUnavailable`. */
export function metricsMcpPort(options: MetricsMcpOptions): MetricsPort {
  const ask = mcpPortClient({ port: "metrics", connector: "warehouse", contract: METRICS_MCP_TOOLS, cacheMs: options.cacheMs ?? DEFAULT_CACHE_MS }, options);
  return {
    readFacts: (requests) => Promise.all(requests.map((request) => ask("query_facts", request))),
    masterData: () => ask("master_data", {}),
    listMetrics: async (search) => (await ask("list_metrics", { search })).metrics,
    describeEntity: (kind, query) => ask("describe_entity", { kind, query }),
  };
}
