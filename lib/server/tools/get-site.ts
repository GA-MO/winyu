import type { z } from "zod";
import { getSiteInputSchema } from "@/lib/contracts";
import { currentAccess } from "@/lib/server/request-context";
import { siteDetail } from "@/lib/server/sites";
import { defineTool } from "./define";

export const getSiteTool = defineTool({
  name: "get_site",
  connector: "sites",
  tier: "read",
  roles: "all",
  description: "Read the safety picture of Winyu's plants, distribution centres and head office. Without id or name: every site with its photo, days since the last lost-time injury, the last 90 days and status badges, the ones that need attention first. With an id (from the list) or a name: one site's photo, three headline numbers, facts, open corrective actions, the incident timeline of the last 12 months and the people on site. Call it for questions about accidents, safety, near misses or a plant.",
  input: getSiteInputSchema,
  execute: async ({ id, name }: z.infer<typeof getSiteInputSchema>) => siteDetail(currentAccess(), id, name),
});
