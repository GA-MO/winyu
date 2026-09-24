import type { z } from "zod";
import { metricQuerySchema } from "@/lib/contracts";
import { ports } from "@/lib/server/ports";
import { actionsForMetric, followUpsForMetric } from "@/lib/server/next-actions";
import { currentAccess, recordQuery } from "@/lib/server/request-context";
import { defineTool } from "./define";

export const queryMetricTool = defineTool({
  name: "query_metric",
  connector: "warehouse",
  tier: "read",
  roles: "all",
  description:
    "Read one certified metric from the semantic layer. Call it for every number you report: volumes, values, attainment, days of cover, margin, AR, headcount. Group with dims, narrow with filters, use compare for prev_period / prev_year / target. With a limit, set sort to the order the question asks (delta_asc = fell most, delta_desc = grew most, value_asc = lowest, value_desc = highest): rows are ranked by it before the limit cuts, so \"top 10 that fell\" really is the ten that fell most.",
  input: metricQuerySchema,
  execute: async (input: z.infer<typeof metricQuerySchema>) => {
    recordQuery(input);
    const access = currentAccess();
    const result = await ports().metrics.runMetric(input, access);
    if (!result.ok) return result;
    const nextActions = actionsForMetric(access, input, result);
    return { ...result, query: input, nextActions, followUps: followUpsForMetric(access, input, result, nextActions) };
  },
});
