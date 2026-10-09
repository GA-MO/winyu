import type { z } from "zod";
import { describeEntityInputSchema } from "@/lib/contracts";
import { unlessMetricsDown } from "@/lib/server/metrics";
import { ports } from "@/lib/server/ports";
import { defineTool } from "./define";

export const describeEntityTool = defineTool({
  name: "describe_entity",
  connector: "warehouse",
  tier: "read",
  roles: "all",
  description: "Look up one master-data record by name or id: a distributor (agent), SKU, distribution centre, campaign or user. Call it to resolve a name the user mentioned before using it as a filter.",
  input: describeEntityInputSchema,
  execute: ({ kind, query }: z.infer<typeof describeEntityInputSchema>) => unlessMetricsDown(() => ports().metrics.describeEntity(kind, query)),
});
