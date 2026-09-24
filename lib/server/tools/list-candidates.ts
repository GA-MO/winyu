import type { z } from "zod";
import { listCandidatesInputSchema } from "@/lib/contracts";
import { listCandidates } from "@/lib/server/recruiting";
import { currentAccess } from "@/lib/server/request-context";
import { defineTool } from "./define";

export const listCandidatesTool = defineTool({
  name: "list_candidates",
  connector: "hris",
  tier: "read",
  roles: "all",
  description: "List job candidates for the open positions the viewer may see (HR, the CEO, the hiring manager and managers above them): stage (step of steps, stage_percent for a Progress bar), interview score out of 5, experience, strength, concern, source, badges, plus three headline numbers. position = an id or words from the title (\"พนักงานขาย ขอนแก่น\"); null = every visible opening. Anyone else gets PERMISSION_DENIED.",
  input: listCandidatesInputSchema,
  execute: async ({ position, stage }: z.infer<typeof listCandidatesInputSchema>) => listCandidates(currentAccess(), { position, stage }),
});
