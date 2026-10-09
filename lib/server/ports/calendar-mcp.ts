import type { CalendarPort } from "./calendar";
import { CALENDAR_MCP_TOOLS } from "./calendar-mcp-contract";
import { mcpPortClient, type McpEndpoint } from "./mcp-port";

const CACHE_MS = 30 * 60_000;

/** The calendar port as a client of the company calendar's MCP server; the calendar changes a few times a year, so it is kept half an hour. */
export function calendarMcpPort(endpoint: McpEndpoint): CalendarPort {
  const ask = mcpPortClient({ port: "calendar", connector: "calendar", contract: CALENDAR_MCP_TOOLS, cacheMs: CACHE_MS }, endpoint);
  return { load: () => ask("load_calendar", {}) };
}
