import { metricAccess } from "@/lib/access/grants";
import { metricQueryInputSchema, type MetricId, type MetricQueryInput } from "@/lib/contracts";
import { METRICS, TARGET_METRICS } from "@/lib/semantic/metrics";
import { resolveQuery } from "@/lib/semantic/periods";
import { loadDictionary } from "@/lib/server/master-data";
import { runMetric } from "@/lib/server/metrics";
import { askedQuery } from "@/lib/semantic/resolved";
import { actionsForMetric, followUpsForMetric } from "@/lib/server/next-actions";
import { currentAccess, recordQuery } from "@/lib/server/request-context";
import { defineTool } from "./define";
import { metricQueryFix } from "./correct";
import { metricAnswerHolds } from "./verify";

const DESCRIPTION =
  "Read one certified metric from the semantic layer. Call it for every number you report: volumes, values, attainment, days of cover, margin, AR, headcount. Group with dims, narrow with filters, use compare for prev_period / prev_year / target. With a limit, set sort to the order the question asks (delta_asc = fell most, delta_desc = grew most, value_asc = lowest, value_desc = highest): rows are ranked by it before the limit cuts, so \"top 10 that fell\" really is the ten that fell most. A threshold in the question (\"under 10 days\", \"over 5 million\") goes in where { op: below | above, value } so only the rows that meet it come back. For a period the user names (this week, this month, last month, this year, the last 7 or 30 days) set period and leave range null: the server turns it into dates and says in the summary how far the data reaches; use range only for dates the user gives.";

/** The dims (for both dims and filters) each metric accepts, grouped by shared set, and the metrics that take compare "target"; anything else is refused. */
export function metricShapeLines(): string {
  const byDims = new Map<string, MetricId[]>();
  for (const def of Object.values(METRICS)) byDims.set(def.dims.join(", "), [...(byDims.get(def.dims.join(", ")) ?? []), def.id]);
  const dims = [...byDims].map(([list, metrics]) => `${metrics.join(", ")}: ${list}`);
  return [`Dims and filters each metric accepts (any other is refused): ${dims.join("; ")}.`, `compare "target" only for ${[...TARGET_METRICS].join(", ")}.`].join(" ");
}

export const queryMetricTool = defineTool({
  name: "query_metric",
  connector: "warehouse",
  tier: "read",
  roles: "all",
  description: `${DESCRIPTION} ${metricShapeLines()}`,
  input: metricQueryInputSchema,
  verify: metricAnswerHolds,
  correct: metricQueryFix,
  execute: async (input: MetricQueryInput) => {
    const resolved = resolveQuery(input);
    if (!resolved.ok) return resolved;
    const { access, grant } = metricAccess(currentAccess(), resolved.query.metric, new Date());
    const result = await runMetric(resolved.query, access);
    if (!result.ok) return result;
    recordQuery(askedQuery(result.query));
    const dictionary = await loadDictionary();
    const nextActions = actionsForMetric(access, result, dictionary);
    const provenance = grant ? { ...result.provenance, grant } : result.provenance;
    return { ...result, provenance, nextActions, followUps: followUpsForMetric(access, result, dictionary, nextActions) };
  },
});
