import { crmDemoEnv } from "@/lib/server/connectors/crm-demo-config";
import { lmsDemoEnv } from "@/lib/server/connectors/lms-demo-config";
import { assetsDemoEnv, assetsDemoFetch } from "./mcp-demo-assets";
import { crmDemoFetch } from "./mcp-demo-crm";
import { lmsDemoFetch } from "./mcp-demo-lms";
import { portOf } from "./mcp-demo-server";

const HOST = "127.0.0.1";

const DEMO_SYSTEMS = [
  { label: "LMS training history (code connector)", url: lmsDemoEnv().url, fetch: lmsDemoFetch },
  { label: "CRM (code connector)", url: crmDemoEnv().url, fetch: crmDemoFetch },
  { label: "Asset register (writes, for the console)", url: assetsDemoEnv().url, fetch: assetsDemoFetch },
];

for (const system of DEMO_SYSTEMS) {
  const server = Bun.serve({ port: portOf(system.url), hostname: HOST, fetch: system.fetch });
  console.log(`${system.label} demo MCP on ${server.url}mcp`);
}
