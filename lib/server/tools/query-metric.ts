import { metricAccess } from "@/lib/access/grants";
import { metricQueryInputSchema, type AccessContext, type MetricId, type MetricQueryInput } from "@/lib/contracts";
import { ownAgentsFilter } from "@/lib/data/entities/agents";
import { TH } from "@/lib/i18n/th";
import { METRICS, TARGET_METRICS } from "@/lib/semantic/metrics";
import { resolveQuery } from "@/lib/semantic/periods";
import { loadDictionary } from "@/lib/server/master-data";
import { runMetric } from "@/lib/server/metrics";
import { askedQuery } from "@/lib/semantic/resolved";
import { rowsNamedIn } from "@/lib/cards/asked";
import { actionsForMetric, actionsForRefusal, followUpsForMetric } from "@/lib/server/next-actions";
import { currentAccess, currentTurn, recordQuery } from "@/lib/server/request-context";
import { defineTool } from "./define";
import { metricQueryFix } from "./correct";
import { metricAnswerHolds } from "./verify";

const FIRST_PERSON = /ผม|ดิฉัน|ฉัน|หนู/;
const WIDER_THAN_OWN = /ทั้งภาค|ทุกเอเย่นต์|ทั้งหมด|ทั้งบริษัท|ทั้งประเทศ|ภาค[ก-๙]|จังหวัด/;
const NAMED_PLACE_DIMS = ["agent", "province"] as const;

/** A rep's question about their own book ("ผมขายได้กี่เปอร์เซ็นต์", "ยอดของผม") with no place named reads the agents assigned to them, as the "my agents" quick action does; scope is unchanged, this only narrows inside it. Null when the default does not apply. */
export function ownBookQuery(input: MetricQueryInput, access: AccessContext, question: string | null): { input: MetricQueryInput; agents: number } | null {
  if (access.role !== "sales_rep" || !question || !FIRST_PERSON.test(question) || WIDER_THAN_OWN.test(question)) return null;
  if (!METRICS[input.metric]?.dims.includes("agent")) return null;
  if (NAMED_PLACE_DIMS.some((dim) => (input.filters?.[dim]?.length ?? 0) > 0)) return null;
  const own = ownAgentsFilter(access.userId).agent;
  if (!own) return null;
  return { input: { ...input, filters: { ...input.filters, agent: own } }, agents: own.length };
}

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
  execute: async (asked: MetricQueryInput) => {
    const own = ownBookQuery(asked, currentAccess(), currentTurn().question);
    const input = own?.input ?? asked;
    const resolved = resolveQuery(input);
    if (!resolved.ok) return resolved;
    const { access, grant } = metricAccess(currentAccess(), resolved.query.metric, new Date());
    const result = await runMetric(resolved.query, access);
    if (!result.ok) return result.code === "PERMISSION_DENIED" ? { ...result, nextActions: actionsForRefusal(access, resolved.query) } : result;
    recordQuery(askedQuery(result.query));
    const dictionary = await loadDictionary();
    const nextActions = actionsForMetric(access, result, dictionary);
    const provenance = grant ? { ...result.provenance, grant } : result.provenance;
    const summary = own ? `${result.summary} · ${TH.quick.ownAgentsApplied(own.agents)}` : result.summary;
    const named = rowsNamedIn(currentTurn().question, result.query, result.rows);
    const headline = named.length > 0 ? { ...result.headline, asked: named } : result.headline;
    return { ...result, summary, headline, provenance, nextActions, followUps: followUpsForMetric(access, result, dictionary, nextActions) };
  },
});
