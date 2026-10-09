import { assetsDemoEnv, assetsDemoFetch } from "./mcp-demo-assets";
import { portOf } from "./mcp-demo-server";

const HOST = "127.0.0.1";

const server = Bun.serve({ port: portOf(assetsDemoEnv().url), hostname: HOST, fetch: assetsDemoFetch });
console.log(`Asset register demo MCP (writes, for the console) on ${server.url}mcp`);
