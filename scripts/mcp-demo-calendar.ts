import type { CalendarPort } from "@/lib/server/ports/calendar";
import { CALENDAR_MCP_TOOLS, calendarMcpEnv } from "@/lib/server/ports/calendar-mcp-contract";
import { GENERATOR_PORTS } from "@/lib/server/ports/generator";
import { contractTools, mcpDemoFetch, portOf } from "./mcp-demo-server";

const SERVER_INFO = { name: "winyu-calendar-demo", version: "0.1.0" };

/** What the demo company calendar reads: its holidays, alcohol-ban days and festivals, and the secret it checks Winyu's signature with. */
export type CalendarDemoSystems = { calendar: CalendarPort; secret: () => string };

/** The demo company calendar, kept outside Winyu: holidays, alcohol-ban days and festivals, only for callers whose identity Winyu signed. */
export function calendarDemoFetchFor(systems: CalendarDemoSystems) {
  return mcpDemoFetch({
    info: SERVER_INFO,
    secret: systems.secret,
    tools: contractTools(CALENDAR_MCP_TOOLS, {
      load_calendar: async () => {
        const records = await systems.calendar.load();
        return { holidays: [...records.holidays], alcoholBanDates: [...records.alcoholBanDates], festivals: [...records.festivals] };
      },
    }),
  });
}

export const calendarDemoFetch = calendarDemoFetchFor({ ...GENERATOR_PORTS, secret: () => calendarMcpEnv().secret });

if (import.meta.main) {
  const server = Bun.serve({ port: portOf(calendarMcpEnv().url), hostname: "127.0.0.1", fetch: calendarDemoFetch });
  console.log(`Company calendar demo MCP on ${server.url}mcp`);
}
