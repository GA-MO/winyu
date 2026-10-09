import { LEARNING_MCP_TOOLS } from "./learning-mcp-contract";
import { mcpPortClient, type McpEndpoint } from "./mcp-port";
import type { LearningPort } from "./learning";

const CACHE_MS = 60_000;

/** The learning port as a client of the LMS's MCP server; the catalogue is read once a minute at most. */
export function learningMcpPort(endpoint: McpEndpoint): LearningPort {
  const ask = mcpPortClient({ port: "learning", connector: "lms", contract: LEARNING_MCP_TOOLS, cacheMs: CACHE_MS }, endpoint);
  return { courses: async () => (await ask("list_courses", {})).courses };
}
