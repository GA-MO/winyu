import type { DirectoryPort } from "./directory";
import { HRIS_MCP_TOOLS } from "./hris-mcp-contract";
import type { LeavePort } from "./leave";
import { mcpPortClient, type McpEndpoint } from "./mcp-port";
import type { RecruitingPort } from "./recruiting";

const DIRECTORY_CACHE_MS = 5 * 60_000;
const LEAVE_CACHE_MS = 60_000;
const CANDIDATES_CACHE_MS = 60_000;
const LEAVE_FRESH = ["leave_balances", "list_leave_requests", "submit_leave_request", "decide_leave_request"] as const;

/** The directory port as a client of the HRIS: the whole directory in one call, kept five minutes; no answer is a `PortUnavailable`, never an empty directory. */
export function directoryMcpPort(endpoint: McpEndpoint): DirectoryPort {
  const ask = mcpPortClient({ port: "directory", connector: "hris", contract: HRIS_MCP_TOOLS, cacheMs: DIRECTORY_CACHE_MS }, endpoint);
  return { load: () => ask("load_directory", {}) };
}

/** The leave port as a client of the HRIS's leave module: the policy is reused for a minute; balances, requests and every write go to the HRIS each time. */
export function leaveMcpPort(endpoint: McpEndpoint): LeavePort {
  const ask = mcpPortClient({ port: "leave", connector: "leave", contract: HRIS_MCP_TOOLS, cacheMs: LEAVE_CACHE_MS, fresh: LEAVE_FRESH }, endpoint);
  return {
    policy: () => ask("leave_policy", {}),
    balances: async (employeeId) => (await ask("leave_balances", { employeeId })).balances,
    requests: async (employeeId) => (await ask("list_leave_requests", { employeeId })).requests,
    submit: (submission) => ask("submit_leave_request", submission),
    decide: async (requestId, approverId, approved) => (await ask("decide_leave_request", { requestId, approverId, approved })).request,
  };
}

/** The recruiting port as a client of the HRIS's recruiting module. */
export function recruitingMcpPort(endpoint: McpEndpoint): RecruitingPort {
  const ask = mcpPortClient({ port: "recruiting", connector: "hris", contract: HRIS_MCP_TOOLS, cacheMs: CANDIDATES_CACHE_MS }, endpoint);
  return { candidates: async () => (await ask("list_candidates", {})).candidates };
}
