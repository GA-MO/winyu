import { metricAccess } from "@/lib/access/grants";
import { outOfScopeFilters, type OutOfScope } from "@/lib/access/enforce";
import { REGIONS, metricQueryInputSchema, type AccessContext, type Dim, type MetricId, type MetricQueryInput } from "@/lib/contracts";
import { ownAgentsFilter } from "@/lib/data/entities/agents";
import { TH } from "@/lib/i18n/th";
import { METRICS, TARGET_METRICS } from "@/lib/semantic/metrics";
import { resolveQuery } from "@/lib/semantic/periods";
import { loadDictionary } from "@/lib/server/master-data";
import type { Dictionary } from "@/lib/semantic/dictionary";
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
const WHOLE_COMPANY = /ทั้งบริษัท|ทั้งประเทศ|ทั่วประเทศ|ทุกภาค|ภาพรวมบริษัท/;
const PLACE_DIMS = ["region", "province", "agent", "dc"] as const;
const MIN_NAME_LENGTH = 3;
const SPACES = /\s+/g;

function squeezed(text: string): string {
  return text.replace(SPACES, "");
}

/** Whether the question itself names one of a filter's places: the value as the model wrote it, its label, or the label's first word ("อีสานรุ่งโรจน์" of "อีสานรุ่งโรจน์ ค้าส่ง"). */
function namedInQuestion(question: string, dim: Dim, values: readonly string[], dictionary: Dictionary): boolean {
  const text = squeezed(question);
  return values.some((value) => {
    const id = dictionary.resolveDimValue(dim, value);
    const label = id ? dictionary.displayLabel(dim, id) : value;
    return [value, label, label.split(" ")[0] ?? ""].map(squeezed).some((name) => name.length >= MIN_NAME_LENGTH && text.includes(name));
  });
}

/** A rep's question about their own book ("ผมขายได้กี่เปอร์เซ็นต์", "ยอดของผม") reads the agents assigned to them, as the "my agents" quick action and the home pin do; an agent or province the question does not name itself (the model took it from his title) gives way to them. Scope is unchanged, this only narrows inside it. Null when the default does not apply. */
export function ownBookQuery(input: MetricQueryInput, access: AccessContext, question: string | null, dictionary: Dictionary): { input: MetricQueryInput; agents: number } | null {
  if (access.role !== "sales_rep" || !question || !FIRST_PERSON.test(question) || WIDER_THAN_OWN.test(question)) return null;
  if (!METRICS[input.metric]?.dims.includes("agent")) return null;
  if (NAMED_PLACE_DIMS.some((dim) => namedInQuestion(question, dim, input.filters?.[dim] ?? [], dictionary))) return null;
  const own = ownAgentsFilter(access.userId).agent;
  if (!own) return null;
  const { agent: _agent, province: _province, ...others } = input.filters ?? {};
  return { input: { ...input, filters: { ...others, agent: own } }, agents: own.length };
}

/** A question about the whole company ("ยอดรวมทั้งบริษัท", "ทุกภาค") whose query names no place: what it needs beyond the asker's scope, which the gateway would otherwise narrow away in silence and draw as their own region's number. Empty when the scope covers it or the question does not ask it. */
export function wholeCompanyBeyondScope(query: MetricQueryInput, access: AccessContext, question: string | null): OutOfScope[] {
  if (!question || !WHOLE_COMPANY.test(question)) return [];
  if (!METRICS[query.metric]?.dims.includes("region")) return [];
  if (PLACE_DIMS.some((dim) => (query.filters?.[dim]?.length ?? 0) > 0)) return [];
  return outOfScopeFilters(access, { region: [...REGIONS] });
}

function wholeCompanyRefusal(beyond: readonly OutOfScope[], dictionary: Dictionary) {
  const seen = beyond.flatMap((denial) => denial.allowed.map((id) => dictionary.displayLabel(denial.dim, id)));
  return { ok: false as const, code: "PERMISSION_DENIED" as const, error: TH.quick.wholeCompanyOutOfScope(seen.join(", ")) };
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
    const dictionary = await loadDictionary();
    const own = ownBookQuery(asked, currentAccess(), currentTurn().question, dictionary);
    const input = own?.input ?? asked;
    const resolved = resolveQuery(input);
    if (!resolved.ok) return resolved;
    const { access, grant } = metricAccess(currentAccess(), resolved.query.metric, new Date());
    const beyond = wholeCompanyBeyondScope(resolved.query, access, currentTurn().question);
    if (beyond.length > 0) return { ...wholeCompanyRefusal(beyond, dictionary), nextActions: actionsForRefusal(access, resolved.query) };
    const result = await runMetric(resolved.query, access);
    if (!result.ok) return result.code === "PERMISSION_DENIED" ? { ...result, nextActions: actionsForRefusal(access, resolved.query) } : result;
    recordQuery(askedQuery(result.query));
    const nextActions = actionsForMetric(access, result, dictionary);
    const provenance = grant ? { ...result.provenance, grant } : result.provenance;
    const summary = own ? `${result.summary} · ${TH.quick.ownAgentsApplied(own.agents)}` : result.summary;
    const named = rowsNamedIn(currentTurn().question, result.query, result.rows);
    const headline = named.length > 0 ? { ...result.headline, asked: named } : result.headline;
    return { ...result, summary, headline, provenance, nextActions, followUps: followUpsForMetric(access, result, dictionary, nextActions) };
  },
});
