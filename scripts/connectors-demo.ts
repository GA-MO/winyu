import { crmDemoEnv } from "@/lib/server/connectors/crm-demo-config";
import { lmsDemoEnv } from "@/lib/server/connectors/lms-demo-config";
import { crmDemoFetch } from "./mcp-demo-crm";
import { lmsDemoFetch } from "./mcp-demo-lms";
import { portOf } from "./mcp-demo-server";

const HOST = "127.0.0.1";

const lms = Bun.serve({ port: portOf(lmsDemoEnv().url), hostname: HOST, fetch: lmsDemoFetch });
const crm = Bun.serve({ port: portOf(crmDemoEnv().url), hostname: HOST, fetch: crmDemoFetch });
console.log(`LMS demo MCP on ${lms.url}mcp`);
console.log(`CRM demo MCP on ${crm.url}mcp`);
