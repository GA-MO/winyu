import { generateObject, generateText, stepCountIs, type LanguageModel, type ToolSet } from "ai";
import { fenceAsData } from "@/lib/harness/fence";
import { z } from "zod";
import { accessFor } from "@/lib/access/policies";
import { managerOf } from "@/lib/access/raci";
import { rowPassagesIn } from "@/lib/cards/asked";
import { percentIn } from "@/lib/cards/breakdown";
import { presentCard, weakestRow } from "@/lib/cards/present";
import { isTimeDim } from "@/lib/cards/rows";
import { toneOf } from "@/lib/dashboard/metric-display";
import { explainGapInputSchema, storySchema, type AccessContext, type AlertRow, type DraftStory, type Investigation, type MetricId, type MetricQuery, type MetricResult, type MetricSort, type Story, type User } from "@/lib/contracts";
import { DATA_AS_OF, businessToday } from "@/lib/data/dates";
import { USERS, findUser } from "@/lib/data/entities/users";
import { agentsOwnedBy } from "@/lib/data/entities/agents";
import { TH } from "@/lib/i18n/th";
import { runMetric } from "@/lib/server/metrics";
import { askedQuery } from "@/lib/semantic/resolved";
import { aiSdkTools } from "@/lib/server/agent/ai-sdk-tools";
import { winyuTools, toolsForAccess } from "@/lib/server/agent/tools";
import { tracedRun } from "@/lib/harness/runtime";
import { runWithAccess } from "@/lib/server/request-context";
import { measure } from "@/lib/server/usage-meter";
import { byUrgency, explains, unexplainedP1 } from "@/lib/server/story-coverage";
import { metricLabel } from "@/lib/dashboard/metric-display";

const MAX_STEPS = 18;
const ALERT_LIMIT = 10;
const ALERTS_TOOL = "get_alerts";
const QUERY_TOOL = "query_metric";
const GAP_TOOL = "explain_gap";
const ALERT_INPUT = { status: "open", limit: ALERT_LIMIT } as const;
const NUMBER = /\d+(?:[.,]\d+)*/g;
const TRIVIAL_NUMBER = /^\d{1,2}$/;
const UNSIGNED_PERCENT = /(?<![+−\-\d.,])\d+(?:\.\d+)?%/g;
const CHANGE_SORTS: ReadonlySet<string> = new Set(["delta_asc", "delta_desc"]);
const RISE = 100;
const MINUS = /^[−-]/;
const LIMITS = { finding: 100, scope: 40, ruledOut: 40, evidenceTitle: 60, action: 90 } as const;
const REMEMBERED = new Set(["recall_memory"]);
const HONORIFIC = "คุณ";
const BARE_NAME_MIN_LENGTH = 4;
const INVESTIGATE_TOOL_BUDGET = 80;
const INVESTIGATE_GOAL = "Explain this person's open anomalies before they open Winyu";
const SALES_VOLUME = "net_sales_volume";
const SALES_VALUE = "net_sales_value";
const LITRES = "ลิตร";
const VOLUME_WORDING = /ปริมาณขายเข้า(?:\s*\(Sell-in\))?|ปริมาณขาย/g;
const HEDGE = "น่าจะ";
const HEDGED = /น่าจะ|อาจ|คาดว่า|สมมติฐาน|ยังไม่ยืนยัน|ยังไม่รู้/;
/** Causes an anomaly's hypothesis guesses at, by the words that name them, and the metrics that measure the cause itself (a story about overdue debt may say debt). */
const GUESSED_CAUSES: readonly { words: RegExp; measuredBy: readonly MetricId[] }[] = [
  { words: /เครดิต|หนี้|ค้างชำระ|วงเงิน|วางบิล/, measuredBy: ["ar_overdue"] },
  { words: /สต๊อกค้าง|ของค้าง/, measuredBy: ["stock_on_hand", "days_of_cover"] },
  { words: /ซ่อมบำรุง|ขัดข้อง/, measuredBy: [] },
];
const MAX_STORIES = 4;

const EXPLANATION_CHECKS: readonly { text: string; open: (access: AccessContext) => boolean }[] = [
  { text: "season vs prior year", open: () => true },
  { text: "stock/cover", open: (access) => access.metricAcl.days_of_cover === "full" },
  { text: "campaigns", open: (access) => access.metricAcl.campaign_spend === "full" && access.metricAcl.campaign_uplift === "full" },
  { text: "other regions", open: (access) => access.regions === "all" },
  { text: "sell-in vs sell-out", open: (access) => access.metricAcl.net_sales_volume === "full" && access.metricAcl.sell_out_volume === "full" },
];

/** The investigation's instructions for one person: the explanations it asks the model to test are only those this person's access can read in full. */
export function investigateSystemFor(access: AccessContext): string {
  const checks = EXPLANATION_CHECKS.filter((check) => check.open(access)).map((check) => check.text);
  return [
    "You are Winyu, the analyst of a Thai beverage company. Before this person opens Winyu today, explain the open anomalies listed in the prompt. Those anomalies are the only matters.",
    "Work like a senior analyst: pick the anomalies that most need this person, then drill down (region → agent/province/channel/SKU) until you know WHERE each problem sits. Do not investigate a topic that is not one of those anomalies.",
    "For any shortfall against target or a prior period, call explain_gap: it returns each part's share of the gap and, for month-to-date against target, where the month ends. Never compute a share or a projection yourself.",
    `Test explanations with data (${checks.join(", ")}). Say what you ruled out and what is still unknown. A precedent or a memory note makes a cause likely, not confirmed.`,
    "For every matter, make sure one query_metric or explain_gap call shows where the problem sits (by agent, province, SKU or DC, in the matter's own scope): it becomes the card the person sees.",
    "Default window: month-to-date (the 1st of this month to today). Use another window only when the signal needs it, and always say which.",
    "Every number you state must come from a tool result in this run.",
    "Think about what THIS person does about it, given their role and who reports to them: a director asks the role that owns it, a planner moves stock, a rep visits the agent. If nothing needs them today, say so plainly.",
    "Finish with a short summary of your findings in English, citing the numbers and their periods.",
  ].join("\n");
}

const STORY_SYSTEM = [
  `Turn an analyst's investigation into at most ${MAX_STORIES} stories for one person's Winyu home page, written in Thai, the most urgent first.`,
  "A story has three parts and each says something the others do not:",
  "- `finding`: what is happening, where, and what it means for this person, in one or two short sentences.",
  "- `evidence`: the one query_metric or explain_gap call that proves the finding, by its `index` in the tool results. Winyu draws it as a card: a query_metric result as it is, an explain_gap call as the same metric split the same way against the same comparison, biggest shortfall first. The card shows the number, the comparison, the pace to target and where the month ends. `evidence.title` names the card: what and where, no numbers. A matter no such call shows (an incident, a licence, a vacancy) has evidence null.",
  "- `action`: the one thing THIS person does next in their role. The owner acts; a manager asks the role that owns it a specific question; someone who only follows gets null. It never repeats the finding.",
  "The card shows the numbers, so the finding never repeats the card's headline number or its month-end projection: it says what they mean (\"จะปิดเดือนต่ำกว่าเป้า\", \"ของจะหมดก่อนรอบเติม\"). A number the card does not show (a date, a count) may appear, copied exactly as the tool wrote it. A part's share of a gap is said as its amount (gap_label), never as a percent: the card prints its own percent for the same row, and two percents for one row read as one number.",
  "Pick as evidence the call whose rows show where the problem sits, in the same scope as the finding. A card must agree with its finding: a story about one agent is not proven by a whole region's total.",
  "Winyu draws a sell-in card in baht (net_sales_value), the measure chat answers sales in, even when the analysis worked in litres: a finding about sell-in quotes no litre amount.",
  "`ruledOut`: at most two explanations a tool result in this run showed are NOT the cause, each with that tool's name as `source`. Empty when nothing was ruled out.",
  "State a cause as fact only when a tool result shows it; a likely cause is written as likely (\"น่าจะ\", \"อาจ\"), an untested one as not yet known.",
  "An anomaly's `hypothesis` is a guess, not a finding: a story that names the cause it guesses (credit, overdue debt, stock held at the agent, a line stopped for repair) keeps its hedge (\"น่าจะ\") even when a tool result shows the cause is present, since being present does not show it caused the drop.",
  "Refer to people by their role (ผู้จัดการขายภาคอีสาน, ฝ่ายสินเชื่อ, ทีมขายขอนแก่น, นักวางแผนซัพพลาย), never by name: who holds a role changes. The people a matter is about (an employee to train, an agent to visit) may be named.",
  "`scope` is where the matter sits in a few words (\"ภาคอีสาน\", \"DC ลำพูน · เพอร์ร่า 600 มล.\"). `subject` is the metric and region of the anomaly the story explains.",
  "`kind` is how urgent it is for the business, whoever owns it: urgent when it needs action within days (a target about to be missed, stock about to run out, a deadline), watch when it is worth knowing, ok when fine.",
  "Never show error codes, ids or tool names to the reader; say what they mean in Thai.",
  `Keep it short enough to read in a glance: finding at most ${LIMITS.finding} characters, scope ${LIMITS.scope}, each ruledOut ${LIMITS.ruledOut}, evidence title ${LIMITS.evidenceTitle}, action ${LIMITS.action}. No filler words.`,
  "Every story explains one of the open anomalies from get_alerts, and every P1 anomaly that is this person's gets a story; anomalies on one metric in one region are one story. If that list has no rows, or nothing needs this person, return one ok story that says so.",
].join("\n");

const storiesSchema = z.object({ stories: z.array(storySchema).max(MAX_STORIES) });

export type ToolCall = { tool: string; input: unknown; output: unknown };
export type ReviewedDraft = { draft: DraftStory; ungrounded: string[]; names: string[]; problems: string[] };
/** The card each call could become, by the call's index: a query_metric result as it is, an explain_gap call as the query that draws the same split. */
export type EvidenceIndex = ReadonlyMap<number, MetricAnswer>;
/** One investigation as it ran: the stories kept, what the analyst wrote and called, the drafts dropped, and the P1 anomalies of this person no kept story explains. */
export type InvestigationRun = { investigation: Investigation; notes: string; calls: ToolCall[]; dropped: { finding: string; ungrounded: string[]; names: string[] }[]; uncovered: AlertRow[] };
type MetricAnswer = Extract<MetricResult, { ok: true }> & { query: MetricQuery };

/** The open anomalies this person would get from get_alerts, read before the model runs so a story cannot start without them. */
export async function openAnomalies(access: AccessContext): Promise<ToolCall> {
  const { execute } = winyuTools()[ALERTS_TOOL];
  const output = await runWithAccess(access, () => execute(ALERT_INPUT));
  return { tool: ALERTS_TOOL, input: ALERT_INPUT, output };
}

function isAlertRow(row: unknown): row is AlertRow {
  if (!row || typeof row !== "object") return false;
  const candidate = row as Partial<AlertRow>;
  return typeof candidate.severity === "string" && typeof candidate.metric === "string" && typeof candidate.scope === "object" && candidate.scope !== null;
}

/** The anomaly rows a get_alerts call returned. */
export function anomaliesOf(call: ToolCall): AlertRow[] {
  const output = call.output;
  if (!output || typeof output !== "object" || !("rows" in output) || !Array.isArray(output.rows)) return [];
  return output.rows.filter(isAlertRow);
}

function theirAnomalies(userId: string, anomalies: readonly AlertRow[]): AlertRow[] {
  const owned = new Set(agentsOwnedBy(userId).map((agent) => agent.id));
  if (owned.size === 0) return [...anomalies];
  return anomalies.filter((anomaly) => !anomaly.scope.agent || owned.has(anomaly.scope.agent));
}

/** The P1 anomalies of this person that none of these stories explains; an anomaly on an agent someone else owns is an agent owner's context, not theirs. */
export function uncoveredFor(userId: string, subjects: readonly DraftStory["subject"][], anomalies: readonly AlertRow[]): AlertRow[] {
  return unexplainedP1(subjects, theirAnomalies(userId, anomalies));
}

/** Keeps the anomaly read on the call list when the model drilled without calling get_alerts itself. */
export function callsWithAnomalies(anomalies: ToolCall, calls: readonly ToolCall[]): ToolCall[] {
  return calls.some((call) => call.tool === ALERTS_TOOL) ? [...calls] : [anomalies, ...calls];
}

function investigationPrompt(who: string, anomalies: ToolCall): string {
  return [`Investigate for: ${who}`, "Open anomalies for this person, most relevant first. Explain these and only these:", fenceAsData(JSON.stringify(anomalies.output))].join("\n");
}

function quietRun(userId: string, modelId: string, anomalies: ToolCall): InvestigationRun {
  const story: Story = { id: `${userId}-0`, kind: "ok", finding: TH.stories.noAnomalies, scope: TH.stories.steady, subject: { metric: null, region: null }, evidence: null, ruledOut: [], action: null };
  const investigation = { id: userId, userId, at: new Date().toISOString(), model: modelId, stories: [story], checkedCount: 1, costUsd: 0 };
  return { investigation, notes: "", calls: [anomalies], dropped: [], uncovered: [] };
}

function readTools(access: AccessContext): ToolSet {
  return aiSdkTools(toolsForAccess(access).filter((tool) => tool.entry.tier === "read"));
}

function scopeLine(access: AccessContext): string {
  const regions = access.regions === "all" ? "all regions" : access.regions.join(", ");
  const brands = access.brands === "all" ? "all brands" : access.brands.join(", ");
  return `${regions} · ${brands}`;
}

function orgLine(user: User): string {
  const manager = managerOf(user.id);
  const reports = USERS.filter((other) => other.managerId === user.id).map((other) => other.title);
  return `Reports to: ${manager ? manager.title : "nobody"}. Direct reports: ${reports.length > 0 ? reports.join(", ") : "none"}.`;
}

function ownedLine(userId: string): string {
  const owned = agentsOwnedBy(userId);
  if (owned.length === 0) return "";
  return `Owns agents: ${owned.map((agent) => `${agent.nameTh} (${agent.id})`).join(", ")}. Their matters come first; an anomaly on another agent of the region is context, not this person's story. `;
}

/** Who the investigation is for: role, scope, the agents they own, their line and the day. */
export function whoOf(user: User, access: AccessContext): string {
  return `${user.title} (role ${user.role}). Scope: ${scopeLine(access)}. ${ownedLine(user.id)}${orgLine(user)} Today is ${businessToday()}; the warehouse holds data through ${DATA_AS_OF}.`;
}

function textsOf(draft: DraftStory): string[] {
  return [draft.finding, draft.scope, draft.action ?? "", draft.evidence?.title ?? "", ...draft.ruledOut.map((entry) => entry.text)];
}

function numbersIn(text: string): string[] {
  return (text.match(NUMBER) ?? []).filter((number) => !TRIVIAL_NUMBER.test(number));
}

/** The numbers a story's words show that no tool returned. */
export function ungroundedIn(draft: DraftStory, calls: readonly ToolCall[]): string[] {
  const source = JSON.stringify(calls.map((call) => call.output));
  const missing = textsOf(draft).flatMap(numbersIn).filter((number) => !source.includes(number) && !source.includes(number.replaceAll(",", "")));
  return [...new Set(missing)];
}

/** The parts of a story longer than a glance allows. */
export function tooLongIn(draft: DraftStory): string[] {
  const over = (text: string | null | undefined, limit: number) => typeof text === "string" && text.length > limit;
  return [
    ...(over(draft.finding, LIMITS.finding) ? [`finding > ${LIMITS.finding}`] : []),
    ...(over(draft.scope, LIMITS.scope) ? [`scope > ${LIMITS.scope}`] : []),
    ...(over(draft.action, LIMITS.action) ? [`action > ${LIMITS.action}`] : []),
    ...(over(draft.evidence?.title, LIMITS.evidenceTitle) ? [`evidence title > ${LIMITS.evidenceTitle}`] : []),
    ...draft.ruledOut.filter((entry) => over(entry.text, LIMITS.ruledOut)).map((entry) => `ruledOut "${entry.text}" > ${LIMITS.ruledOut}`),
  ];
}

function metricAnswerOf(output: unknown): MetricAnswer | null {
  if (typeof output !== "object" || output === null) return null;
  const candidate = output as Partial<MetricAnswer>;
  if (candidate.ok !== true || !candidate.query || !Array.isArray(candidate.rows) || !candidate.headline) return null;
  return candidate as MetricAnswer;
}

/** The query_metric question an explain_gap call answers: its metric split by its dimension against its comparison, the parts that made the gap first. */
export function gapQueryOf(input: unknown, gapLabel: string | null = null): MetricQuery | null {
  const parsed = explainGapInputSchema.safeParse(input);
  if (!parsed.success) return null;
  const { metric, split, filters, range, compare } = parsed.data;
  const sort: MetricSort = gapLabel === null || MINUS.test(gapLabel) ? "delta_asc" : "delta_desc";
  return { metric, dims: [split], filters, range, grain: "day", compare, limit: null, sort, where: null };
}

/** A split by a dimension the query already narrowed to one value repeats that value on every row; the card drops it. */
export function withoutPinnedDims(query: MetricQuery): MetricQuery {
  const dims = query.dims.filter((dim) => query.filters[dim]?.length !== 1);
  return dims.length === query.dims.length ? query : { ...query, dims };
}

function badSideFirst(metric: MetricId): MetricSort {
  return toneOf(metric, RISE) === "bad" ? "delta_desc" : "delta_asc";
}

/** A story's card proves something that moved: a comparison split one way ranks its rows by the change, the bad side first, and drops dimensions its filter pins. */
export function evidenceQueryOf(query: MetricQuery): MetricQuery {
  const pinned = withoutPinnedDims(query);
  const [only] = pinned.dims;
  if (pinned.compare === "none" || pinned.dims.length !== 1 || isTimeDim(only) || CHANGE_SORTS.has(pinned.sort ?? "")) return pinned;
  return { ...pinned, sort: badSideFirst(pinned.metric) };
}

async function answerOf(query: MetricQuery, access: AccessContext): Promise<MetricAnswer | null> {
  const result = await runMetric(query, access);
  return result.ok ? result : null;
}

/** A sell-in card in the measure chat answers sales in (baht), so the morning story and the chat about one month show one number; litres stay for whoever cannot see baht. */
function inSalesMeasure(query: MetricQuery, access: AccessContext): MetricQuery {
  if (query.metric !== SALES_VOLUME || access.metricAcl[SALES_VALUE] !== "full") return query;
  return { ...query, metric: SALES_VALUE };
}

async function queryAnswerOf(call: ToolCall, access: AccessContext): Promise<MetricAnswer | null> {
  const answer = metricAnswerOf(call.output);
  if (!answer) return null;
  const query = inSalesMeasure(evidenceQueryOf(answer.query), access);
  return query === answer.query ? answer : answerOf(query, access);
}

async function gapAnswerOf(call: ToolCall, access: AccessContext): Promise<MetricAnswer | null> {
  const output = call.output as { ok?: unknown; gap_label?: unknown } | null;
  if (output?.ok !== true) return null;
  const query = gapQueryOf(call.input, typeof output.gap_label === "string" ? output.gap_label : null);
  return query ? answerOf(inSalesMeasure(withoutPinnedDims(query), access), access) : null;
}

/** Every call that could become a story's card, drawn under the person's access. */
export async function evidenceIndexOf(calls: readonly ToolCall[], access: AccessContext): Promise<EvidenceIndex> {
  const entries = await Promise.all(
    calls.map(async (call, index) => {
      if (call.tool === QUERY_TOOL) return [index, await queryAnswerOf(call, access)] as const;
      if (call.tool === GAP_TOOL) return [index, await gapAnswerOf(call, access)] as const;
      return [index, null] as const;
    }),
  );
  return new Map(entries.flatMap(([index, answer]) => (answer ? [[index, answer] as const] : [])));
}

/** The numbers the evidence card already shows under its title: the headline, the row that decides and where the month ends. */
export function cardNumbersOf(answer: MetricAnswer, title: string): string[] {
  const parts = presentCard({ title, query: answer.query, result: answer });
  const shown = [parts.hero?.value, weakestRow(answer.query, answer)?.value, answer.headline.projection?.attainment];
  return shown.flatMap((text) => numbersIn(text ?? ""));
}

/** The numbers a finding repeats from its own card. */
export function repeatedIn(draft: DraftStory, evidence: EvidenceIndex): string[] {
  const answer = draft.evidence ? evidence.get(draft.evidence.call) : undefined;
  if (!answer || !draft.evidence) return [];
  const finding = numbersIn(draft.finding);
  return cardNumbersOf(answer, draft.evidence.title).filter((number) => finding.includes(number));
}

/** Each row of an evidence card by label, with the figure the card prints for it ("52.4%"). */
function printedRowsOf(answer: MetricAnswer, title: string): Map<string, string> {
  const { body } = presentCard({ title, query: answer.query, result: answer });
  if (body.kind !== "strip" && body.kind !== "exceptions") return new Map();
  const folded = body.kind === "exceptions" ? (body.fold?.rows ?? []) : [];
  return new Map([...body.strip.rows, ...folded].map((row) => [row.label, row.text]));
}

/** Unsigned percentages a finding sets beside a row its card prints a different figure for (a share of the gap, 48.3%, over a row the card shows at 52.4% of the month target, AI-240): one number with two meanings on one screen, and the sentence travels down the chain as the ask. */
export function sharesBesideCardIn(draft: DraftStory, evidence: EvidenceIndex): string[] {
  const answer = draft.evidence ? evidence.get(draft.evidence.call) : undefined;
  if (!answer || !draft.evidence) return [];
  const printed = printedRowsOf(answer, draft.evidence.title);
  return rowPassagesIn(draft.finding, answer.query, answer.rows).flatMap(({ label, words }) => {
    const shown = printed.get(label);
    const quoted = words.match(UNSIGNED_PERCENT) ?? [];
    return shown ? quoted.filter((text) => percentIn(text) !== percentIn(shown)).map((text) => `finding quotes ${text} for ${label} while its card prints ${shown} for that row: say a share of the gap as its amount in money, or the card's own figure`) : [];
  });
}

function namePatternsOf(user: User): string[] {
  const first = user.nameTh.replace(HONORIFIC, "").trim().split(/\s+/)[0] ?? "";
  if (!first) return [];
  return first.length >= BARE_NAME_MIN_LENGTH ? [`${HONORIFIC}${first}`, first] : [`${HONORIFIC}${first}`];
}

/** Names of people who hold a role in Winyu, found in a story's words; a story names roles, since who holds one changes. */
export function roleHoldersNamedIn(draft: DraftStory): string[] {
  const text = textsOf(draft).join(" ");
  return [...new Set(USERS.flatMap((user) => (namePatternsOf(user).some((pattern) => text.includes(pattern)) ? [user.nameTh] : [])))];
}

function litresUnderBaht(draft: DraftStory, evidence: EvidenceIndex): string[] {
  const answer = draft.evidence ? evidence.get(draft.evidence.call) : undefined;
  return answer?.query.metric === SALES_VALUE && draft.finding.includes(LITRES) ? ["finding quotes litres while its card is in baht"] : [];
}

function guessedPart(hypothesis: string): string | null {
  const at = hypothesis.indexOf(HEDGE);
  return at === -1 ? null : hypothesis.slice(at);
}

/** The causes a finding states as fact that only an anomaly it explains guessed at ("น่าจะติดปัญหาเครดิต" told as "ติดหนี้ค้างชำระจนไม่สั่งซื้อ"). */
export function guessesStatedAsFact(draft: DraftStory, anomalies: readonly AlertRow[]): string[] {
  const { metric } = draft.subject;
  if (metric === null || HEDGED.test(draft.finding)) return [];
  const guesses = anomalies.filter((anomaly) => explains(draft.subject, anomaly)).flatMap((anomaly) => guessedPart(anomaly.hypothesis) ?? []);
  return GUESSED_CAUSES.filter((cause) => !cause.measuredBy.includes(metric) && cause.words.test(draft.finding) && guesses.some((guess) => cause.words.test(guess)))
    .map((cause) => `finding states the anomaly's guessed cause (${draft.finding.match(cause.words)?.[0]}) as fact: keep the hedge (${HEDGE}) the hypothesis has`);
}

/** Every check a draft story must pass before it is kept: grounded numbers and no role holder named block it; the rest asks for one rewrite. */
export function reviewDrafts(drafts: readonly DraftStory[], calls: readonly ToolCall[], evidence: EvidenceIndex): ReviewedDraft[] {
  const anomalies = calls.filter((call) => call.tool === ALERTS_TOOL).flatMap(anomaliesOf);
  return drafts.map((draft) => {
    const wrongEvidence = draft.evidence && !evidence.has(draft.evidence.call) ? [`evidence.call ${draft.evidence.call} is not a successful query_metric or explain_gap call`] : [];
    const repeated = repeatedIn(draft, evidence).map((number) => `finding repeats the card's number ${number}`);
    const problems = [...tooLongIn(draft), ...wrongEvidence, ...repeated, ...sharesBesideCardIn(draft, evidence), ...litresUnderBaht(draft, evidence), ...guessesStatedAsFact(draft, anomalies)];
    return { draft, ungrounded: ungroundedIn(draft, calls), names: roleHoldersNamedIn(draft), problems };
  });
}

/** The card's title names the measure the card draws: a sell-in card drawn in baht is not titled in litres, whichever measure the writer named. */
export function titleOfDrawn(title: string, query: MetricQuery): string {
  return query.metric === SALES_VALUE ? title.replace(VOLUME_WORDING, metricLabel(SALES_VALUE)) : title;
}

function needsRewrite(entry: ReviewedDraft): boolean {
  return entry.ungrounded.length > 0 || entry.names.length > 0 || entry.problems.length > 0;
}

function isBlocked(entry: ReviewedDraft): boolean {
  return entry.ungrounded.length > 0 || entry.names.length > 0;
}

function storyOf(entry: ReviewedDraft, calls: readonly ToolCall[], evidenceIndex: EvidenceIndex): Omit<Story, "id"> {
  const called = new Set(calls.map((call) => call.tool));
  const answer = entry.draft.evidence ? evidenceIndex.get(entry.draft.evidence.call) : undefined;
  const evidence = answer && entry.draft.evidence ? { title: titleOfDrawn(entry.draft.evidence.title, answer.query), query: askedQuery(answer.query) } : null;
  const ruledOut = entry.draft.ruledOut.filter((item) => called.has(item.source) && !REMEMBERED.has(item.source));
  return { ...entry.draft, evidence, ruledOut };
}

/** The stories kept from reviewed drafts, the ones the most severe anomalies back first: a blocked draft is dropped, a ruled-out claim stands only on a data tool this run called, the evidence becomes the query Winyu draws again, and the P1 anomalies of this person left unexplained are named. */
export function storiesFrom(userId: string, reviewed: readonly ReviewedDraft[], calls: readonly ToolCall[], evidence: EvidenceIndex, anomalies: readonly AlertRow[]): Pick<InvestigationRun, "dropped" | "uncovered"> & { stories: Story[] } {
  const kept = reviewed.filter((entry) => !isBlocked(entry)).map((entry) => storyOf(entry, calls, evidence));
  const stories = byUrgency(kept, anomalies).slice(0, MAX_STORIES).map((story, index) => ({ ...story, id: `${userId}-${index}` }));
  const dropped = reviewed.filter(isBlocked).map((entry) => ({ finding: entry.draft.finding, ungrounded: entry.ungrounded, names: entry.names }));
  return { stories, dropped, uncovered: uncoveredFor(userId, stories.map((story) => story.subject), anomalies) };
}

function indexed(calls: readonly ToolCall[]): unknown[] {
  return calls.map((call, index) => ({ index, ...call }));
}

function rewriteAsk(repair: readonly ReviewedDraft[], missing: readonly AlertRow[]): string[] {
  const fix = repair.length > 0 ? ["Rewrite these stories. `ungrounded` lists numbers no tool returned: copy them from the tool results or leave them out. `names` lists people named where their role belongs. `problems` lists the rest to fix:", fenceAsData(JSON.stringify(repair))] : [];
  const add = missing.length > 0 ? ["No story explains these P1 anomalies of this person. Write one story for each matter among them (anomalies on one metric in one region are one matter), from the analyst notes and tool results:", fenceAsData(JSON.stringify(missing))] : [];
  return fix.length + add.length > 0 ? [...fix, ...add, "Return only the stories asked for here."] : [];
}

async function draftStories(model: LanguageModel, who: string, notes: string, calls: readonly ToolCall[], repair: readonly ReviewedDraft[] = [], missing: readonly AlertRow[] = []): Promise<DraftStory[]> {
  const fix = rewriteAsk(repair, missing);
  const { object } = await generateObject({
    model,
    schema: storiesSchema,
    system: STORY_SYSTEM,
    prompt: [`For: ${who}`, `A ruledOut source is one of these tool names, spelled exactly: ${[...new Set(calls.map((call) => call.tool))].join(", ")}.`, "Analyst notes:", fenceAsData(notes), "Tool results, each with its index:", fenceAsData(JSON.stringify(indexed(calls))), ...fix].join("\n"),
  });
  return object.stories;
}

/** One person's morning investigation, traced as a run of its own: read their open anomalies first, then the model drills into those with the read tools of their role and writes stories that point at their evidence; a story that fails a check, or a P1 anomaly of theirs no story explains, gets one rewrite, and one with a number no tool returned or a role holder's name is dropped. No anomalies means one quiet story and no model call. */
export async function investigate(userId: string, model: LanguageModel, modelId: string): Promise<InvestigationRun> {
  return tracedRun(userId, { userMessage: INVESTIGATE_GOAL, intent: "job:investigate" }, INVESTIGATE_TOOL_BUDGET, () => investigateNow(userId, model, modelId));
}

async function investigateNow(userId: string, model: LanguageModel, modelId: string): Promise<InvestigationRun> {
  const user = findUser(userId);
  if (!user) throw new Error(`no user ${userId}`);
  const access = accessFor(user);
  const anomalies = await openAnomalies(access);
  const rows = anomaliesOf(anomalies);
  if (rows.length === 0) return quietRun(userId, modelId, anomalies);
  const who = whoOf(user, access);
  const { result, usage } = await measure(async () => {
    const run = await runWithAccess(access, () => generateText({ model, system: investigateSystemFor(access), prompt: investigationPrompt(who, anomalies), tools: readTools(access), stopWhen: stepCountIs(MAX_STEPS) }));
    const calls = callsWithAnomalies(anomalies, run.steps.flatMap((step) => step.toolResults.map((toolResult) => ({ tool: toolResult.toolName, input: toolResult.input, output: toolResult.output }))));
    const evidence = await evidenceIndexOf(calls, access);
    const first = reviewDrafts(await draftStories(model, who, run.text, calls), calls, evidence);
    const failed = first.filter(needsRewrite);
    const missing = uncoveredFor(userId, first.map((entry) => entry.draft.subject), rows);
    const rewritten = failed.length > 0 || missing.length > 0 ? reviewDrafts(await draftStories(model, who, run.text, calls, failed, missing), calls, evidence) : [];
    return { notes: run.text, calls, evidence, reviewed: [...first.filter((entry) => !needsRewrite(entry)), ...rewritten] };
  });
  const { stories, dropped, uncovered } = storiesFrom(userId, result.reviewed, result.calls, result.evidence, rows);
  const costUsd = usage.billedCalls > 0 ? usage.billedUsd : usage.estimatedUsd;
  const investigation = { id: userId, userId, at: new Date().toISOString(), model: modelId, stories, checkedCount: result.calls.length, costUsd };
  return { investigation, notes: result.notes, calls: result.calls, dropped, uncovered };
}
