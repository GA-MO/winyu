import type { z } from "zod";
import { metricAccess } from "@/lib/access/grants";
import { metricQuerySchema } from "@/lib/contracts";
import { loadDictionary } from "@/lib/server/master-data";
import { runMetric } from "@/lib/server/metrics";
import { actionsForMetric, followUpsForMetric } from "@/lib/server/next-actions";
import { currentAccess, recordQuery } from "@/lib/server/request-context";
import { defineTool } from "./define";
import { metricQueryFix } from "./correct";
import { metricAnswerHolds } from "./verify";

export const queryMetricTool = defineTool({
  name: "query_metric",
  connector: "warehouse",
  tier: "read",
  roles: "all",
  description:
    "Read one certified metric from the semantic layer. Call it for every number you report: volumes, values, attainment, days of cover, margin, AR, headcount. Group with dims, narrow with filters, use compare for prev_period / prev_year / target. With a limit, set sort to the order the question asks (delta_asc = fell most, delta_desc = grew most, value_asc = lowest, value_desc = highest): rows are ranked by it before the limit cuts, so \"top 10 that fell\" really is the ten that fell most. A threshold in the question (\"under 10 days\", \"over 5 million\") goes in where { op: below | above, value } so only the rows that meet it come back.",
  input: metricQuerySchema,
  verify: metricAnswerHolds,
  correct: metricQueryFix,
  execute: async (input: z.infer<typeof metricQuerySchema>) => {
    recordQuery(input);
    const { access, grant } = metricAccess(currentAccess(), input.metric, new Date());
    const result = await runMetric(input, access);
    if (!result.ok) return result;
    const nextActions = actionsForMetric(access, input, result, await loadDictionary());
    const provenance = grant ? { ...result.provenance, grant } : result.provenance;
    return { ...result, provenance, query: input, nextActions, followUps: followUpsForMetric(access, input, result, nextActions) };
  },
});
