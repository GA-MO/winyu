import { GENERATOR_PORTS } from "@/lib/server/ports/generator";
import type { SitesPort } from "@/lib/server/ports/sites";
import { SITES_MCP_TOOLS, sitesMcpEnv } from "@/lib/server/ports/sites-mcp-contract";
import { contractTools, mcpDemoFetch, portOf } from "./mcp-demo-server";

const SERVER_INFO = { name: "winyu-ehs-demo", version: "0.1.0" };

/** What the demo safety system reads: its site register and incident log, and the secret it checks Winyu's signature with. */
export type EhsDemoSystems = { sites: SitesPort; secret: () => string };

/** The demo safety (EHS) system: sites and incidents, only for callers whose identity Winyu signed. */
export function ehsDemoFetchFor(systems: EhsDemoSystems) {
  return mcpDemoFetch({
    info: SERVER_INFO,
    secret: systems.secret,
    tools: contractTools(SITES_MCP_TOOLS, {
      load_sites: async () => {
        const records = await systems.sites.load();
        return { sites: [...records.sites], incidents: [...records.incidents] };
      },
    }),
  });
}

export const ehsDemoFetch = ehsDemoFetchFor({ ...GENERATOR_PORTS, secret: () => sitesMcpEnv().secret });

if (import.meta.main) {
  const server = Bun.serve({ port: portOf(sitesMcpEnv().url), hostname: "127.0.0.1", fetch: ehsDemoFetch });
  console.log(`Safety (EHS) demo MCP on ${server.url}mcp`);
}
