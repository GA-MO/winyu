import { CRM_DEMO_PORT } from "@/lib/server/connectors/crm-demo-config";
import { LMS_DEMO_PORT } from "@/lib/server/connectors/lms-demo-config";
import { crmDemoFetch } from "./rest-demo-crm";
import { lmsDemoFetch } from "./mcp-demo-lms";

const HOST = "127.0.0.1";

const lms = Bun.serve({ port: LMS_DEMO_PORT, hostname: HOST, fetch: lmsDemoFetch });
const crm = Bun.serve({ port: CRM_DEMO_PORT, hostname: HOST, fetch: crmDemoFetch });
console.log(`LMS demo MCP on ${lms.url}mcp`);
console.log(`CRM demo REST on ${crm.url}api/visits`);
