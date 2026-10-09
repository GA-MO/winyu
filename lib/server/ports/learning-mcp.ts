import { LEARNING_MCP_TOOLS } from "./learning-mcp-contract";
import { mcpPortClient, type McpEndpoint } from "./mcp-port";
import type { LearningPort } from "./learning";

const CACHE_MS = 60_000;
const FRESH = ["list_courses", "list_enrollments", "request_seat", "decide_enrollment"] as const;

/** The learning port as a client of the LMS's MCP server; seats change with every request, so the catalogue, enrollments and every write go to the LMS each time. */
export function learningMcpPort(endpoint: McpEndpoint): LearningPort {
  const ask = mcpPortClient({ port: "learning", connector: "lms", contract: LEARNING_MCP_TOOLS, cacheMs: CACHE_MS, fresh: FRESH }, endpoint);
  return {
    courses: async () => (await ask("list_courses", {})).courses,
    enrollments: async (employeeId) => (await ask("list_enrollments", { employeeId })).enrollments,
    requestSeat: (request) => ask("request_seat", request),
    decide: async (enrollmentId, approverId, approved) => (await ask("decide_enrollment", { enrollmentId, approverId, approved })).enrollment,
  };
}
