import type { z } from "zod";
import { getPersonInputSchema } from "@/lib/contracts";
import { personProfile } from "@/lib/server/people";
import { currentAccess } from "@/lib/server/request-context";
import { defineTool } from "./define";

export const getPersonTool = defineTool({
  name: "get_person",
  connector: "hris",
  tier: "read",
  roles: "all",
  description: "Read one employee's profile by id (from find_people) or name: photo, facts, career timeline, certificates with days left, direct reports. Fields outside the viewer's rights are left out by the server.",
  input: getPersonInputSchema,
  execute: async ({ id, name }: z.infer<typeof getPersonInputSchema>) => personProfile(currentAccess(), id, name),
});
