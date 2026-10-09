import { z } from "zod";
import { REGIONS, type Incident, type Site } from "@/lib/contracts";
import { mcpEndpointFromEnv, type McpEndpoint } from "./mcp-port";

export const SITES_MCP_PORT = 3292;

export const siteSchema = z.object({
  id: z.string(),
  nameTh: z.string(),
  kind: z.enum(["plant", "dc", "office"]),
  provinceId: z.string(),
  placeTh: z.string(),
  region: z.enum(REGIONS),
  photo: z.string(),
  headcount: z.number(),
  overtimeHoursPerHead3m: z.number(),
  safetyLeadId: z.string().nullable(),
  lastLtiBeforeLog: z.string().nullable(),
}) satisfies z.ZodType<Site>;

export const incidentSchema = z.object({
  id: z.string(),
  siteId: z.string(),
  date: z.string(),
  kind: z.enum(["lti", "first_aid", "near_miss", "property"]),
  titleTh: z.string(),
  detailTh: z.string(),
  actionTh: z.string(),
  closed: z.boolean(),
}) satisfies z.ZodType<Incident>;

/** The safety (EHS) system's MCP contract for Winyu's sites port: every plant, distribution centre and office with the incident log. */
export const SITES_MCP_TOOLS = {
  load_sites: {
    description: "Every plant, distribution centre and office with its headcount, overtime and safety lead, and every logged incident with its kind, action and whether it is closed.",
    input: z.object({}),
    output: z.object({ sites: z.array(siteSchema), incidents: z.array(incidentSchema) }),
  },
} as const;

/** Where the safety system's MCP listens, the secret Winyu signs identities with, and how long Winyu waits; from env (`WINYU_EHS_MCP_*`), with local defaults for the demo only. */
export function sitesMcpEnv(): McpEndpoint {
  return mcpEndpointFromEnv("EHS", SITES_MCP_PORT);
}
