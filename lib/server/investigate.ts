import { generateObject, generateText, stepCountIs, type LanguageModel, type ToolSet } from "ai";
import { fenceAsData } from "@/lib/harness/fence";
import { z } from "zod";
import { accessFor } from "@/lib/access/policies";
import { managerOf } from "@/lib/access/raci";
import { presentCard, weakestRow } from "@/lib/cards/present";
import { isTimeDim } from "@/lib/cards/rows";
import { toneOf } from "@/lib/dashboard/metric-display";
import { explainGapInputSchema, storySchema, type AccessContext, type DraftStory, type Investigation, type MetricId, type MetricQuery, type MetricResult, type MetricSort, type Story, type User } from "@/lib/contracts";
import { TODAY } from "@/lib/data/dates";
import { USERS, findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { investigations } from "@/lib/server/agent/collections";
import { runMetric } from "@/lib/server/metrics";
import { aiSdkTools } from "@/lib/server/agent/ai-sdk-tools";
import { winyuTools, toolsForAccess } from "@/lib/server/agent/tools";
import { agentModel } from "@/lib/server/models";
import { tracedRun } from "@/lib/harness/runtime";
import { runWithAccess } from "@/lib/server/request-context";
import { measure } from "@/lib/server/usage-meter";

const MAX_STEPS = 18;
const ALERT_LIMIT = 10;
const ALERTS_TOOL = "get_alerts";
const QUERY_TOOL = "query_metric";
const GAP_TOOL = "explain_gap";
const ALERT_INPUT = { status: "open", limit: ALERT_LIMIT } as const;
const NUMBER = /\d+(?:[.,]\d+)*/g;
const TRIVIAL_NUMBER = /^\d{1,2}$/;
const CHANGE_SORTS: ReadonlySet<string> = new Set(["delta_asc", "delta_desc"]);
const RISE = 100;
const MINUS = /^[−-]/;
const LIMITS = { finding: 100, scope: 40, ruledOut: 40, evidenceTitle: 60, action: 90 } as const;
const REMEMBERED = new Set(["recall_memory"]);
const HONORIFIC = "คุณ";
const BARE_NAME_MIN_LENGTH = 4;
const JOB_CONCURRENCY = 3;
const INVESTIGATE_TOOL_BUDGET = 80;
const INVESTIGATE_GOAL = "Explain this person's open anomalies before they open Winyu";

const INVESTIGATE_SYSTEM = [
  "You are Winyu, the analyst of a Thai beverage company. Before this person opens Winyu today, explain the open anomalies listed in the prompt. Those anomalies are the only matters.",
  "Work like a senior analyst: pick the anomalies that most need this person, then drill down (region → agent/province/channel/SKU) until you know WHERE each problem sits. Do not investigate a topic that is not one of those anomalies.",
  "For any shortfall against target or a prior period, call explain_gap: it returns each part's share of the gap and, for month-to-date against target, where the month ends. Never compute a share or a projection yourself.",
  "Test explanations with data (season vs prior year, stock/cover, campaigns, other regions, sell-in vs sell-out). Say what you ruled out and what is still unknown. A precedent or a memory note makes a cause likely, not confirmed.",
  "For every matter, make sure one query_metric or explain_gap call shows where the problem sits (by agent, province, SKU or DC, in the matter's own scope): it becomes the card the person sees.",
  "Default window: month-to-date (the 1st of this month to today). Use another window only when the signal needs it, and always say which.",
  "Every number you state must come from a tool result in this run.",
  "Think about what THIS person does about it, given their role and who reports to them: a director asks the role that owns it, a planner moves stock, a rep visits the agent. If nothing needs them today, say so plainly.",
  "Finish with a short summary of your findings in English, citing the numbers and their periods.",
].join("\n");

const STORY_SYSTEM = [
  "Turn an analyst's investigation into at most three stories for one person's Winyu home page, written in Thai.",
  "A story has three parts and each says something the others do not:",
  "- `finding`: what is happening, where, and what it means for this person, in one or two short sentences.",
  "- `evidence`: the one query_metric or explain_gap call that proves the finding, by its `index` in the tool results. Winyu draws it as a card: a query_metric result as it is, an explain_gap call as the same metric split the same way against the same comparison, biggest shortfall first. The card shows the number, the comparison, the pace to target and where the month ends. `evidence.title` names the card: what and where, no numbers. A matter no such call shows (an incident, a licence, a vacancy) has evidence null.",
  "- `action`: the one thing THIS person does next in their role. The owner acts; a manager asks the role that owns it a specific question; someone who only follows gets null. It never repeats the finding.",
  "The card shows the numbers, so the finding never repeats the card's headline number or its month-end projection: it says what they mean (\"จะปิดเดือนต่ำกว่าเป้า\", \"ของจะหมดก่อนรอบเติม\"). A number the card does not show (a date, a count, a share from explain_gap) may appear, copied exactly as the tool wrote it.",
  "Pick as evidence the call whose rows show where the problem sits, in the same scope as the finding. A card must agree with its finding: a story about one agent is not proven by a whole region's total.",
  "`ruledOut`: at most two explanations a tool result in this run showed are NOT the cause, each with that tool's name as `source`. Empty when nothing was ruled out.",
  "State a cause as fact only when a tool result shows it; a likely cause is written as likely (\"น่าจะ\", \"อาจ\"), an untested one as not yet known.",
  "Refer to people by their role (ผู้จัดการขายภาคอีสาน, ฝ่ายสินเชื่อ, ทีมขายขอนแก่น, นักวางแผนซัพพลาย), never by name: who holds a role changes. The people a matter is about (an employee to train, an agent to visit) may be named.",
  "`scope` is where the matter sits in a few words (\"ภาคอีสาน\", \"DC ลำพูน · เพอร์ร่า 600 มล.\"). `subject` is the metric and region of the anomaly the story explains.",
  "`kind` is how urgent it is for the business, whoever owns it: urgent when it needs action within days (a target about to be missed, stock about to run out, a deadline), watch when it is worth knowing, ok when fine.",
  "Never show error codes, ids or tool names to the reader; say what they mean in Thai.",
  `Keep it short enough to read in a glance: finding at most ${LIMITS.finding} characters, scope ${LIMITS.scope}, each ruledOut ${LIMITS.ruledOut}, evidence title ${LIMITS.evidenceTitle}, action ${LIMITS.action}. No filler words.`,
  "Every story explains one of the open anomalies from get_alerts. If that list has no rows, or nothing needs this person, return one ok story that says so.",
].join("\n");

const storiesSchema = z.object({ stories: z.array(storySchema).max(3) });

export type ToolCall = { tool: string; input: unknown; output: unknown };
export type ReviewedDraft = { draft: DraftStory; ungrounded: string[]; names: string[]; problems: string[] };
/** The card each call could become, by the call's index: a query_metric result as it is, an explain_gap call as the query that draws the same split. */
export type EvidenceIndex = ReadonlyMap<number, MetricAnswer>;
export type InvestigationRun = { investigation: Investigation; notes: string; calls: ToolCall[]; dropped: { finding: string; ungrounded: string[]; names: string[] }[] };
type MetricAnswer = Extract<MetricResult, { ok: true }> & { query: MetricQuery };

/** The open anomalies this person would get from get_alerts, read before the model runs so a story cannot start without them. */
export async function openAnomalies(access: AccessContext): Promise<ToolCall> {
  const { execute } = winyuTools()[ALERTS_TOOL];
  const output = await runWithAccess(access, () => execute(ALERT_INPUT));
  return { tool: ALERTS_TOOL, input: ALERT_INPUT, output };
}

function anomalyRows(call: ToolCall): unknown[] {
  const output = call.output;
  if (!output || typeof output !== "object" || !("rows" in output) || !Array.isArray(output.rows)) return [];
  return output.rows;
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
  return { investigation, notes: "", calls: [anomalies], dropped: [] };
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
  return result.ok ? { ...result, query } : null;
}

async function queryAnswerOf(call: ToolCall, access: AccessContext): Promise<MetricAnswer | null> {
  const answer = metricAnswerOf(call.output);
  if (!answer) return null;
  const query = evidenceQueryOf(answer.query);
  return query === answer.query ? answer : answerOf(query, access);
}

async function gapAnswerOf(call: ToolCall, access: AccessContext): Promise<MetricAnswer | null> {
  const output = call.output as { ok?: unknown; gap_label?: unknown } | null;
  if (output?.ok !== true) return null;
  const query = gapQueryOf(call.input, typeof output.gap_label === "string" ? output.gap_label : null);
  return query ? answerOf(withoutPinnedDims(query), access) : null;
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

/** Every check a draft story must pass before it is kept: grounded numbers and no role holder named block it; the rest asks for one rewrite. */
export function reviewDrafts(drafts: readonly DraftStory[], calls: readonly ToolCall[], evidence: EvidenceIndex): ReviewedDraft[] {
  return drafts.map((draft) => {
    const wrongEvidence = draft.evidence && !evidence.has(draft.evidence.call) ? [`evidence.call ${draft.evidence.call} is not a successful query_metric or explain_gap call`] : [];
    const repeated = repeatedIn(draft, evidence).map((number) => `finding repeats the card's number ${number}`);
    return { draft, ungrounded: ungroundedIn(draft, calls), names: roleHoldersNamedIn(draft), problems: [...tooLongIn(draft), ...wrongEvidence, ...repeated] };
  });
}

function needsRewrite(entry: ReviewedDraft): boolean {
  return entry.ungrounded.length > 0 || entry.names.length > 0 || entry.problems.length > 0;
}

function isBlocked(entry: ReviewedDraft): boolean {
  return entry.ungrounded.length > 0 || entry.names.length > 0;
}

function storyOf(entry: ReviewedDraft, calls: readonly ToolCall[], evidenceIndex: EvidenceIndex, id: string): Story {
  const called = new Set(calls.map((call) => call.tool));
  const answer = entry.draft.evidence ? evidenceIndex.get(entry.draft.evidence.call) : undefined;
  const evidence = answer && entry.draft.evidence ? { title: entry.draft.evidence.title, query: answer.query } : null;
  const ruledOut = entry.draft.ruledOut.filter((item) => called.has(item.source) && !REMEMBERED.has(item.source));
  return { ...entry.draft, id, evidence, ruledOut };
}

/** The stories kept from reviewed drafts: a blocked draft is dropped, a ruled-out claim stands only on a data tool this run called, and the evidence becomes the query Winyu draws again. */
export function storiesFrom(userId: string, reviewed: readonly ReviewedDraft[], calls: readonly ToolCall[], evidence: EvidenceIndex): { stories: Story[]; dropped: InvestigationRun["dropped"] } {
  const kept = reviewed.filter((entry) => !isBlocked(entry));
  const dropped = reviewed.filter(isBlocked).map((entry) => ({ finding: entry.draft.finding, ungrounded: entry.ungrounded, names: entry.names }));
  return { stories: kept.map((entry, index) => storyOf(entry, calls, evidence, `${userId}-${index}`)), dropped };
}

function indexed(calls: readonly ToolCall[]): unknown[] {
  return calls.map((call, index) => ({ index, ...call }));
}

async function draftStories(model: LanguageModel, who: string, notes: string, calls: readonly ToolCall[], repair: readonly ReviewedDraft[] = []): Promise<DraftStory[]> {
  const fix = repair.length > 0 ? ["Rewrite only these stories. `ungrounded` lists numbers no tool returned: copy them from the tool results or leave them out. `names` lists people named where their role belongs. `problems` lists the rest to fix:", fenceAsData(JSON.stringify(repair))] : [];
  const { object } = await generateObject({
    model,
    schema: storiesSchema,
    system: STORY_SYSTEM,
    prompt: [`For: ${who}`, `A ruledOut source is one of these tool names, spelled exactly: ${[...new Set(calls.map((call) => call.tool))].join(", ")}.`, "Analyst notes:", fenceAsData(notes), "Tool results, each with its index:", fenceAsData(JSON.stringify(indexed(calls))), ...fix].join("\n"),
  });
  return object.stories;
}

/** One person's morning investigation, traced as a run of its own: read their open anomalies first, then the model drills into those with the read tools of their role and writes stories that point at their evidence; a story that fails a check gets one rewrite, and one with a number no tool returned or a role holder's name is dropped. No anomalies means one quiet story and no model call. */
export async function investigate(userId: string, model: LanguageModel, modelId: string): Promise<InvestigationRun> {
  return tracedRun(userId, { userMessage: INVESTIGATE_GOAL, intent: "job:investigate" }, INVESTIGATE_TOOL_BUDGET, () => investigateNow(userId, model, modelId));
}

async function investigateNow(userId: string, model: LanguageModel, modelId: string): Promise<InvestigationRun> {
  const user = findUser(userId);
  if (!user) throw new Error(`no user ${userId}`);
  const access = accessFor(user);
  const anomalies = await openAnomalies(access);
  if (anomalyRows(anomalies).length === 0) return quietRun(userId, modelId, anomalies);
  const who = `${user.title} (role ${user.role}). Scope: ${scopeLine(access)}. ${orgLine(user)} Today is ${TODAY}.`;
  const { result, usage } = await measure(async () => {
    const run = await runWithAccess(access, () => generateText({ model, system: INVESTIGATE_SYSTEM, prompt: investigationPrompt(who, anomalies), tools: readTools(access), stopWhen: stepCountIs(MAX_STEPS) }));
    const calls = callsWithAnomalies(anomalies, run.steps.flatMap((step) => step.toolResults.map((toolResult) => ({ tool: toolResult.toolName, input: toolResult.input, output: toolResult.output }))));
    const evidence = await evidenceIndexOf(calls, access);
    const first = reviewDrafts(await draftStories(model, who, run.text, calls), calls, evidence);
    const failed = first.filter(needsRewrite);
    const repaired = failed.length > 0 ? reviewDrafts(await draftStories(model, who, run.text, calls, failed), calls, evidence) : [];
    return { notes: run.text, calls, evidence, reviewed: [...first.filter((entry) => !needsRewrite(entry)), ...repaired] };
  });
  const { stories, dropped } = storiesFrom(userId, result.reviewed, result.calls, result.evidence);
  const costUsd = usage.billedCalls > 0 ? usage.billedUsd : usage.estimatedUsd;
  const investigation = { id: userId, userId, at: new Date().toISOString(), model: modelId, stories, checkedCount: result.calls.length, costUsd };
  return { investigation, notes: result.notes, calls: result.calls, dropped };
}

/** The last investigation stored for this person, or null before the first run. */
export function latestInvestigation(userId: string): Investigation | null {
  return investigations().get(userId) ?? null;
}

export function saveInvestigation(investigation: Investigation): void {
  investigations().put(investigation);
}

/** The morning job: investigate for each given user (everyone by default) on the default real model and keep the result; does nothing when no real model is configured. */
export async function runInvestigateJob(userIds: readonly string[] = USERS.map((user) => user.id)): Promise<number> {
  const configured = agentModel();
  if (!configured) return 0;
  const modelId = configured.id;
  const model = configured.model();
  const queue = [...userIds];
  let saved = 0;
  const workers = Array.from({ length: JOB_CONCURRENCY }, async () => {
    for (let userId = queue.shift(); userId; userId = queue.shift()) {
      const run = await investigate(userId, model, modelId).catch((error: unknown) => {
        console.error(`[mascop] investigation for ${userId} failed`, error);
        return null;
      });
      if (!run) continue;
      saveInvestigation(run.investigation);
      saved += 1;
    }
  });
  await Promise.all(workers);
  return saved;
}
