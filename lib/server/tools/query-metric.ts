import { metricAccess } from "@/lib/access/grants";
import { outOfScopeFilters, type OutOfScope } from "@/lib/access/enforce";
import { REGIONS, metricQueryInputSchema, type AccessContext, type Dim, type MetricId, type MetricQuery, type MetricQueryInput, type MetricResult, type MetricRow, type MonthEndProjection } from "@/lib/contracts";
import { attainmentOf } from "@/lib/cards/breakdown";
import { parityForModel, type ParityForModel } from "@/lib/cards/chart-bodies";
import { monthElapsedOf, yearBehindOf } from "@/lib/cards/present";
import { percentText } from "@/lib/cards/reading";
import { ownAgentsFilter } from "@/lib/data/entities/agents";
import { TH } from "@/lib/i18n/th";
import { METRICS, TARGET_METRICS } from "@/lib/semantic/metrics";
import { resolveQuery } from "@/lib/semantic/periods";
import { loadDictionary } from "@/lib/server/master-data";
import type { Dictionary } from "@/lib/semantic/dictionary";
import { runMetric } from "@/lib/server/metrics";
import { askedQuery } from "@/lib/semantic/resolved";
import { excludedIn, filtersWithout } from "@/lib/semantic/exclusion";
import { namesOf } from "@/lib/semantic/dictionary";
import { asksAmount, asksLowest, asksMonthEnd, rowsNamedIn } from "@/lib/cards/asked";
import { changeTextOf, deltaPercentOf, groupDimsOf, isTimeDim, labelAlong, timeDimOf } from "@/lib/cards/rows";
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
const SUMMARY_SEPARATOR = " · ";
const PACED_FIELDS = ["compare_value", "delta_pct"] as const;
const PARITY = { metric: "sell_out_volume", base: "net_sales_volume", asked: /ขายเข้า|sell-?in/i } as const satisfies { metric: MetricId; base: MetricId; asked: RegExp };

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
function wholeCompanyBeyondScope(query: MetricQueryInput, access: AccessContext, question: string | null): OutOfScope[] {
  if (!question || !WHOLE_COMPANY.test(question)) return [];
  if (!METRICS[query.metric]?.dims.includes("region")) return [];
  if (PLACE_DIMS.some((dim) => (query.filters?.[dim]?.length ?? 0) > 0)) return [];
  return outOfScopeFilters(access, { region: [...REGIONS] });
}

function wholeCompanyRefusal(beyond: readonly OutOfScope[], dictionary: Dictionary) {
  const seen = beyond.flatMap((denial) => denial.allowed.map((id) => dictionary.displayLabel(denial.dim, id)));
  return { ok: false as const, code: "PERMISSION_DENIED" as const, error: TH.quick.wholeCompanyOutOfScope(seen.join(", ")) };
}

type Answered = Extract<MetricResult, { ok: true }>;

function isAnswered(output: unknown): output is Answered {
  return typeof output === "object" && output !== null && (output as { ok?: unknown }).ok === true && "headline" in output && Array.isArray((output as { rows?: unknown }).rows);
}

/** A row as the model reads it on the month's base: its share of its own whole month's target, as its card row prints it, in place of the paced target and the gap to it. */
function onMonthBase(row: MetricRow, elapsed: number): MetricRow {
  const paced = attainmentOf(row);
  const kept = Object.fromEntries(Object.entries(row).filter(([key]) => !(PACED_FIELDS as readonly string[]).includes(key)));
  return paced === null ? kept : { ...kept, month_target_share: `${percentText(paced * elapsed)} ${TH.read.ofMonthTarget}` };
}

/** The month end as the model reads it, each amount under the name of what it is: the share done so far and what is left from today, then the month end and what it will still lack then, so the two shortfalls are never paired the wrong way (AI-204). */
function projectionForModel(projection: MonthEndProjection) {
  return {
    recentDays: projection.recentDays,
    monthTarget: projection.monthTarget,
    doneSoFar: projection.attainmentToDate,
    leftFromToday: projection.remaining,
    monthEnd: projection.attainment,
    monthEndProjected: projection.projected,
    monthEndShortBy: projection.endShortBy ?? null,
  };
}

/** What the model reads of a month-to-date answer against target, a total or a breakdown: the card's one base. The card leads with the share of the whole month's target done so far, puts every row on that base and leaves the paced target out, so the model reads those shares and never a paced figure, which it otherwise spent minutes reconciling with the card (AI-180) or quoted beside it (AI-207); any other result, and the card, the audit and the person, get the result itself. */
function oneBaseForModel(output: unknown): unknown {
  if (!isAnswered(output) || output.query.compare !== "target") return output;
  const { projection, compareLabel } = output.headline;
  if (!projection) return output;
  const paced = compareLabel ? `${compareLabel} ` : null;
  const summary = output.summary.split(SUMMARY_SEPARATOR).filter((part) => !paced || !part.startsWith(paced)).join(SUMMARY_SEPARATOR);
  const headline = { ...output.headline, value: `${projection.attainmentToDate} ${TH.read.ofMonthTarget}`, actual: output.headline.value, deltaPercent: null, deltaPoints: null, compareLabel: null, projection: projectionForModel(projection) };
  const elapsed = monthElapsedOf(output.query, output.provenance.asOf);
  return { ...output, summary, headline, rows: output.rows.map((row) => onMonthBase(row, elapsed)) };
}

/** A year so far against target as the model reads it: one line that answers "will the year reach target" with the amount the rest of the year must make up and the days left, the figures the card's verdict ends with, so the reply names both (AI-251, AI-275). */
function withYearEnd(output: unknown): unknown {
  if (!isAnswered(output) || output.query.compare !== "target") return output;
  const behind = yearBehindOf(output.query, output);
  return behind ? { ...output, headline: { ...output.headline, yearEnd: TH.modelView.yearReach(behind.amount, behind.daysLeft) } } : output;
}

function changeOf(query: MetricQuery, row: MetricRow): { label: string; change: number; text: string } | null {
  const label = labelAlong(groupDimsOf(query), row);
  const change = deltaPercentOf(row);
  const text = changeTextOf(query.metric, row);
  return label === null || change === null || text === null ? null : { label, change, text };
}

/** The rows the question named, read against every other row of the result: how many others moved the same way, and the one that moved furthest when it went further than the asked rows, so a check on the asked rows is never read as proof when the rest moved alike (AI-269). Only for one row per group and a change against an earlier window. */
function askedAgainstOthers(output: unknown): unknown {
  if (!isAnswered(output) || output.query.compare === "target" || timeDimOf(output.query) !== null) return output;
  const asked = output.headline.asked ?? [];
  if (asked.length === 0) return output;
  const changes = output.rows.flatMap((row) => changeOf(output.query, row) ?? []);
  const named = changes.filter((entry) => asked.includes(entry.label));
  const rising = named.every((entry) => entry.change > 0);
  if (named.length === 0 || (!rising && !named.every((entry) => entry.change < 0))) return output;
  const way = TH.modelView.way(rising);
  const smallest = Math.min(...named.map((entry) => Math.abs(entry.change)));
  const alike = changes.filter((entry) => !asked.includes(entry.label) && (rising ? entry.change > 0 : entry.change < 0)).sort((left, right) => Math.abs(right.change) - Math.abs(left.change));
  const [furthest] = alike;
  const others = !furthest ? TH.modelView.othersNone(way) : [TH.modelView.othersToo(way, alike.length), Math.abs(furthest.change) > smallest ? TH.modelView.othersFurther(furthest.label, furthest.text) : TH.modelView.othersNotAsFar(way)].join(" ");
  const line = [TH.modelView.asked(named.map((entry) => `${entry.label} ${entry.text}`).join(", ")), others].join(SUMMARY_SEPARATOR);
  return { ...output, headline: { ...output.headline, askedVsOthers: line } };
}

/** A question that sets places aside ("นอกจากเรื่องอีสาน") reads the places that remain, so the card and its rows follow the question; null when it sets none aside or the query keeps them anyway. */
function withoutSetAside(input: MetricQueryInput, access: AccessContext, question: string | null, dictionary: Dictionary): { input: MetricQueryInput; places: string } | null {
  const excluded = excludedIn(question, dictionary);
  const filters = filtersWithout(input.filters ?? {}, excluded, METRICS[input.metric]?.dims ?? [], access.regions, dictionary);
  if (filters === input.filters) return null;
  return { input: { ...input, filters }, places: Object.values(namesOf(dictionary, excluded)).flat().join(", ") };
}

/** A breakdown sent without an order for a question that asks which row is lowest reads lowest first, so the card, its verdict and the summary lead with the row asked about (AI-351). */
function lowestFirst(input: MetricQueryInput, question: string | null): MetricQueryInput {
  if (input.sort || !input.dims.some((dim) => !isTimeDim(dim)) || !asksLowest(question)) return input;
  return { ...input, sort: "value_asc" };
}

/** What query_metric runs for a question: a rep's own book, then the places the question sets aside, with what each changed for the summary, read lowest first when the question asks for the lowest. A matter stores the read this way when it is sent, so re-running it never needs the sender's question. */
export function narrowedForQuestion(asked: MetricQueryInput, access: AccessContext, question: string | null, dictionary: Dictionary): { input: MetricQueryInput; ownAgents: number | null; setAside: string | null } {
  const own = ownBookQuery(asked, access, question, dictionary);
  const setAside = withoutSetAside(own?.input ?? asked, access, question, dictionary);
  return { input: lowestFirst(setAside?.input ?? own?.input ?? asked, question), ownAgents: own?.agents ?? null, setAside: setAside?.places ?? null };
}

/** The question a read answers: none when the turn re-runs a matter's stored reads, which were narrowed for the sender's question when it was sent. */
function askedQuestion(): string | null {
  return currentTurn().matter ? null : currentTurn().question;
}

/** The rows a matter singles out when the turn re-runs one, else the rows the question names. */
function askedRows(query: MetricQuery, rows: readonly MetricRow[]): string[] {
  const focus = currentTurn().matter?.focus;
  if (!focus) return rowsNamedIn(currentTurn().question, query, rows);
  const dims = groupDimsOf(query);
  return dims.length === 0 ? [] : [...new Set(rows.flatMap((row) => labelAlong(dims, row) ?? []))].filter((label) => focus.includes(label));
}

/** A sell-out breakdown asked against sell-in carries the parity card's own reading (each row's sell-out as a share of its sell-in, the rows the card marks short and its verdict), so the reply judges the rows the way the card does and never by litre differences (AI-332). */
async function withParity(answered: Answered, access: AccessContext): Promise<Answered & { parity?: ParityForModel }> {
  const dim = groupDimsOf(answered.query)[0];
  const question = askedQuestion();
  if (answered.query.metric !== PARITY.metric || !dim || timeDimOf(answered.query) || !question || !PARITY.asked.test(question)) return answered;
  const { scopeApplied: _scope, labels: _labels, ...asked } = answered.query;
  const base = await runMetric({ ...asked, metric: PARITY.base, compare: "none", limit: null, sort: null, where: null }, access);
  if (!base.ok) return answered;
  const parity = parityForModel({ query: base.query, result: base }, { query: answered.query, result: answered }, TH.dash.dimUnit[dim]);
  return parity ? { ...answered, parity, parityBase: base } : answered;
}

function withoutParityBase(output: unknown): unknown {
  if (!isAnswered(output) || !output.parityBase) return output;
  const { parityBase: _base, ...rest } = output;
  return rest;
}

const DESCRIPTION =
  "Read one certified metric from the semantic layer. Call it for every number you report: volumes, values, attainment, days of cover, margin, AR, headcount. Group with dims, narrow with filters, use compare for prev_period / prev_year / target; a split by two dims that names no target or comparison (\"ยอดขายเดือนนี้แยกภาคกับแบรนด์\") keeps compare none, so every cell shows its amount. With a limit, set sort to the order the question asks (delta_asc = fell most, delta_desc = grew most, value_asc = lowest, value_desc = highest): rows are ranked by it before the limit cuts, so \"top 10 that fell\" really is the ten that fell most. A threshold in the question (\"under 10 days\", \"over 5 million\") goes in where { op: below | above, value } so only the rows that meet it come back. For a period the user names (this week, this month, last month, this year, the last 7 or 30 days) set period and leave range null: the server turns it into dates and says in the summary how far the data reaches; for the last N days, weeks or months (\"12 สัปดาห์ล่าสุด\", \"6 เดือนล่าสุด\") set last { count: N, unit } (grain is the bucket to draw) and leave range, period and limit null: the server picks the whole buckets of that span up to the latest finished one; use range only for dates the user gives. A sell-out breakdown asked against sell-in comes back with parity, the card's own reading: answer with its verdict and the rows it marks short (each row's sell-out as a share of its sell-in), not with litre differences.";

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
  modelView: (output: unknown) => askedAgainstOthers(withYearEnd(oneBaseForModel(withoutParityBase(output)))),
  execute: async (asked: MetricQueryInput) => {
    const dictionary = await loadDictionary();
    const narrowed = narrowedForQuestion(asked, currentAccess(), askedQuestion(), dictionary);
    const input = narrowed.input;
    const resolved = resolveQuery(input);
    if (!resolved.ok) return resolved;
    const { access, grant } = metricAccess(currentAccess(), resolved.query.metric, new Date());
    const beyond = wholeCompanyBeyondScope(resolved.query, access, askedQuestion());
    if (beyond.length > 0) return { ...wholeCompanyRefusal(beyond, dictionary), nextActions: actionsForRefusal(access, resolved.query) };
    const result = await runMetric(resolved.query, access);
    if (!result.ok) return result.code === "PERMISSION_DENIED" ? { ...result, nextActions: actionsForRefusal(access, resolved.query) } : result;
    recordQuery(askedQuery(result.query));
    const provenance = grant ? { ...result.provenance, grant } : result.provenance;
    const notes = [...(narrowed.ownAgents !== null ? [TH.quick.ownAgentsApplied(narrowed.ownAgents)] : []), ...(narrowed.setAside !== null ? [TH.quick.excludedApplied(narrowed.setAside)] : [])];
    const summary = [result.summary, ...notes].join(" · ");
    const named = askedRows(result.query, result.rows);
    const closing = Boolean(result.headline.projection) && asksMonthEnd(askedQuestion());
    const amount = result.query.compare === "target" && asksAmount(askedQuestion());
    const answered = await withParity({ ...result, headline: { ...result.headline, ...(named.length > 0 ? { asked: named } : {}), ...(closing ? { asksMonthEnd: true } : {}), ...(amount ? { asksAmount: true } : {}) } }, access);
    const nextActions = actionsForMetric(access, answered, dictionary);
    return { ...answered, summary, provenance, nextActions, followUps: followUpsForMetric(access, answered, dictionary, nextActions) };
  },
});
