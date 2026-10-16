import type { z } from "zod";
import { describeEntityInputSchema } from "@/lib/contracts";
import { describeInScope, subjectOf } from "@/lib/server/entities";
import { currentAccess, recordSubject } from "@/lib/server/request-context";
import { defineTool } from "./define";

export const describeEntityTool = defineTool({
  name: "describe_entity",
  connector: "warehouse",
  tier: "read",
  roles: "all",
  description: "Look up one master-data record by name or id: a distributor (agent, with the sales rep assigned to it and why), SKU, distribution centre, campaign or user. Call it to resolve a name the user mentioned before using it as a filter.",
  input: describeEntityInputSchema,
  execute: async ({ kind, query }: z.infer<typeof describeEntityInputSchema>) => {
    const described = await describeInScope(currentAccess(), kind, query);
    const subject = subjectOf(kind, described);
    if (subject) recordSubject(subject);
    return described;
  },
});
