import { z } from "zod";
import { mcpEndpointFromEnv, type McpEndpoint } from "./mcp-port";
import type { CalendarRecords } from "./calendar";

export const CALENDAR_MCP_PORT = 3291;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isoDate = z.string().regex(ISO_DATE);

export const calendarRecordsSchema = z.object({
  holidays: z.array(z.object({ date: isoDate, nameTh: z.string(), label: z.string() })).readonly(),
  alcoholBanDates: z.array(isoDate).readonly(),
  festivals: z.array(z.object({ from: isoDate, to: isoDate, nameTh: z.string() })).readonly(),
}) satisfies z.ZodType<CalendarRecords>;

/** The company calendar's MCP contract for Winyu's calendar port: public holidays, the days alcohol may not be sold and the festival windows. */
export const CALENDAR_MCP_TOOLS = {
  load_calendar: {
    description: "The company calendar: every public holiday, every day alcohol may not be sold, and the festival windows, as ISO dates with Thai names.",
    input: z.object({}),
    output: calendarRecordsSchema,
  },
} as const;

/** Where the company calendar's MCP listens, the secret Winyu signs identities with, and how long Winyu waits; from env (`WINYU_CALENDAR_MCP_*`), with local defaults for the demo only. */
export function calendarMcpEnv(): McpEndpoint {
  return mcpEndpointFromEnv("CALENDAR", CALENDAR_MCP_PORT);
}
