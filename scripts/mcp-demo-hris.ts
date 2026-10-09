import type { DirectoryPort } from "@/lib/server/ports/directory";
import { GENERATOR_PORTS } from "@/lib/server/ports/generator";
import { HRIS_MCP_TOOLS, hrisMcpEnv } from "@/lib/server/ports/hris-mcp-contract";
import type { LeavePort } from "@/lib/server/ports/leave";
import type { RecruitingPort } from "@/lib/server/ports/recruiting";
import { contractTools, mcpDemoFetch, portOf } from "./mcp-demo-server";

const SERVER_INFO = { name: "winyu-hris-demo", version: "0.1.0" };

/** What the demo HRIS reads: its directory, leave records and recruiting module, and the secret it checks Winyu's signature with. */
export type HrisDemoSystems = { directory: DirectoryPort; leave: LeavePort; recruiting: RecruitingPort; secret: () => string };

/** The demo HRIS: the directory, leave policy, leave taken and candidates, only for callers whose identity Winyu signed. */
export function hrisDemoFetchFor(systems: HrisDemoSystems) {
  return mcpDemoFetch({
    info: SERVER_INFO,
    secret: systems.secret,
    tools: contractTools(HRIS_MCP_TOOLS, {
      load_directory: async () => {
        const records = await systems.directory.load();
        return { employees: [...records.employees], openPositions: [...records.openPositions] };
      },
      leave_policy: () => systems.leave.policy(),
      leave_used_this_year: ({ employeeId }) => systems.leave.usedThisYear(employeeId),
      list_candidates: async () => ({ candidates: [...(await systems.recruiting.candidates())] }),
    }),
  });
}

export const hrisDemoFetch = hrisDemoFetchFor({ ...GENERATOR_PORTS, secret: () => hrisMcpEnv().secret });

if (import.meta.main) {
  const server = Bun.serve({ port: portOf(hrisMcpEnv().url), hostname: "127.0.0.1", fetch: hrisDemoFetch });
  console.log(`HRIS demo MCP on ${server.url}mcp`);
}
