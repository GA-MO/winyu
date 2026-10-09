import { crmDemoEnv } from "@/lib/server/connectors/crm-demo-config";
import { lmsDemoEnv } from "@/lib/server/connectors/lms-demo-config";
import { calendarMcpEnv } from "@/lib/server/ports/calendar-mcp-contract";
import { hrisMcpEnv } from "@/lib/server/ports/hris-mcp-contract";
import { sitesMcpEnv } from "@/lib/server/ports/sites-mcp-contract";
import { assetsDemoEnv, assetsDemoFetch } from "./mcp-demo-assets";
import { calendarDemoFetch } from "./mcp-demo-calendar";
import { crmDemoFetch } from "./mcp-demo-crm";
import { ehsDemoFetch } from "./mcp-demo-ehs";
import { hrisDemoFetch } from "./mcp-demo-hris";
import { lmsDemoFetch } from "./mcp-demo-lms";
import { portOf } from "./mcp-demo-server";

const HOST = "127.0.0.1";

const DEMO_SYSTEMS = [
  { label: "LMS", url: lmsDemoEnv().url, fetch: lmsDemoFetch },
  { label: "CRM", url: crmDemoEnv().url, fetch: crmDemoFetch },
  { label: "HRIS", url: hrisMcpEnv().url, fetch: hrisDemoFetch },
  { label: "Safety (EHS)", url: sitesMcpEnv().url, fetch: ehsDemoFetch },
  { label: "Company calendar", url: calendarMcpEnv().url, fetch: calendarDemoFetch },
  { label: "Asset register (writes, for the console)", url: assetsDemoEnv().url, fetch: assetsDemoFetch },
];

for (const system of DEMO_SYSTEMS) {
  const server = Bun.serve({ port: portOf(system.url), hostname: HOST, fetch: system.fetch });
  console.log(`${system.label} demo MCP on ${server.url}mcp`);
}
