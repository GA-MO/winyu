import { generateObject, generateText, stepCountIs, type LanguageModel, type Tool, type ToolSet } from "ai";
import { fenceAsData } from "vexa/server";
import { z } from "zod";
import { accessFor } from "@/lib/access/policies";
import { managerOf } from "@/lib/access/raci";
import { storySchema, type AccessContext, type DraftStory, type Investigation, type User } from "@/lib/contracts";
import { TODAY } from "@/lib/data/dates";
import { USERS, findUser } from "@/lib/data/entities/users";
import { honestChecks } from "@/lib/engine/check-verdict";
import { withOwner } from "@/lib/engine/story-owner";
import { TH } from "@/lib/i18n/th";
import { investigations } from "@/lib/server/agent/collections";
import { copTools, toolsForAccess, toolTiers } from "@/lib/server/agent/tools";
import { MOCK_MODEL_ID } from "vexa/mock";
import { models } from "@/lib/server/models";
import { runWithAccess } from "@/lib/server/request-context";
import { measure } from "@/lib/server/usage-meter";

const MAX_STEPS = 18;
const ALERT_LIMIT = 10;
const ALERTS_TOOL = "get_alerts";
const ALERT_INPUT = { status: "open", limit: ALERT_LIMIT } as const;
const NUMBER = /\d+(?:[.,]\d+)*/g;
const TRIVIAL_NUMBER = /^\d{1,2}$/;
const GAP_TOOL = "explain_gap";
const LIMITS = { claim: 70, check: 40, detail: 50, recommendation: 90 } as const;
const JOB_CONCURRENCY = 3;


const INVESTIGATE_SYSTEM = [
  "You are Cop, the analyst of a Thai beverage company. Before this person opens Cop today, explain the open anomalies listed in the prompt. Those anomalies are the only matters.",
  "Work like a senior analyst: pick the anomalies that most need this person, then drill down (region → agent/province/channel/SKU) until you know WHERE each problem sits. Do not investigate a topic that is not one of those anomalies.",
  "For any shortfall against target or a prior period, call explain_gap: it returns each part's share of the gap and, for month-to-date against target, where the month ends. Never compute a share or a projection yourself.",
  "Test explanations with data (season vs prior year, stock/cover, campaigns, other regions, sell-in vs sell-out). Say what you ruled out and what is still unknown. A precedent or a memory note makes a cause likely, not confirmed.",
  "Default window: month-to-date (the 1st of this month to today). Use another window only when the signal needs it, and always say which.",
  "Every number you state must come from a tool result in this run.",
  "Think about what THIS person does about it, given their role and who reports to them: a director asks the owner, a planner moves stock, a rep visits the agent. If nothing needs them today, say so plainly.",
  "Finish with a short summary of your findings in English, citing the numbers and their periods.",
].join("\n");

const STORY_SYSTEM = [
  "Turn an analyst's investigation into at most three stories for one person's Cop home page, written in Thai.",
  "A story is a conclusion, not a chart: `claim` is one short sentence this person can act on.",
  "Copy every number exactly as it appears in the tool results, with its unit; never compute or round new numbers.",
  "`shareOfGap` only from explain_gap's share_label, else null. `projection` only from explain_gap's projection ({ label: its label, value: its attainment_label }) or get_forecast, else null.",
  "For a story about a target, the headline is the attainment so far (explain_gap's attainment_label, label \"เทียบเป้า\"), not the raw volume.",
  "`headline.tone`: bad when the number is bad news for this business (below target, overdue money up, stock running out), good when it is good news, else neutral.",
  "`period` is the window the headline covers, as the tool labelled it. `subject` is the metric and region of the anomaly the story explains.",
  "`checked`: confirmed and ruled_out only when a tool result shows it directly, and `source` is that tool's name; likely for a pattern, precedent or memory note; unknown when nothing tested it.",
  "Never show error codes, ids or tool names to the reader; say what they mean in Thai.",
  "The claim and recommendation may state a cause as fact only when a check confirmed it; a likely cause is written as likely (\"น่าจะ\", \"อาจ\"), an unknown one as still unknown.",
  "`kind` is how urgent it is for the business, whoever owns it: urgent when it needs action within days (a target about to be missed, stock about to run out, a deadline), watch when it is worth knowing, ok when fine.",
  "`recommendation` is what THIS person does next in their role: the owner acts; a manager asks the owner a specific question; someone else only follows.",
  "Keep it short enough to read in a glance: claim at most 70 characters, each check at most 40, each cause detail at most 50, recommendation at most 90. No filler words.",
  "Every story explains one of the open anomalies from get_alerts. If that list has no rows, return one ok story that says nothing needs this person today.",
  "If nothing needs this person, return one ok story that says so.",
].join("\n");

const storiesSchema = z.object({ stories: z.array(storySchema).max(3) });


type ToolCall = { tool: string; input: unknown; output: unknown };
export type InvestigationRun = { investigation: Investigation; notes: string; calls: ToolCall[]; dropped: { claim: string; ungrounded: string[] }[] };

/** The open anomalies this person would get from get_alerts, read before the model runs so a story cannot start without them. */
export async function openAnomalies(access: AccessContext): Promise<ToolCall> {
  const definition = copTools()[ALERTS_TOOL] as Tool;
  const execute = definition.execute as (args: unknown, options: unknown) => Promise<unknown>;
  const output = await runWithAccess(access, () => execute(ALERT_INPUT, {}));
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
  const draft: DraftStory = {
    kind: "ok",
    claim: TH.stories.nothingToDecide,
    scope: TH.stories.steady,
    period: TODAY,
    subject: { metric: null, region: null },
    headline: { label: TH.stories.steady, value: "—", tone: "neutral" },
    projection: null,
    causes: [],
    checked: [],
    recommendation: null,
  };
  const investigation = { id: userId, userId, at: new Date().toISOString(), model: modelId, stories: [withOwner(draft, userId, `${userId}-0`)], checkedCount: 1, costUsd: 0 };
  return { investigation, notes: "", calls: [anomalies], dropped: [] };
}

function readTools(access: AccessContext): ToolSet {
  const tiers = toolTiers();
  return Object.fromEntries(Object.entries(toolsForAccess(access)).filter(([name]) => tiers[name] === "read"));
}

function scopeLine(access: AccessContext): string {
  const regions = access.regions === "all" ? "all regions" : access.regions.join(", ");
  const brands = access.brands === "all" ? "all brands" : access.brands.join(", ");
  return `${regions} · ${brands}`;
}

function orgLine(user: User): string {
  const manager = managerOf(user.id);
  const reports = USERS.filter((other) => other.managerId === user.id).map((other) => `${other.nameTh} (${other.title})`);
  return `Reports to: ${manager ? `${manager.nameTh} (${manager.title})` : "nobody"}. Direct reports: ${reports.length > 0 ? reports.join(", ") : "none"}.`;
}

function numbersOf(story: DraftStory): string[] {
  const { subject: _subject, ...shown } = story;
  return (JSON.stringify(shown).match(NUMBER) ?? []).filter((number) => !TRIVIAL_NUMBER.test(number));
}

/** The numbers a story shows that no tool returned; a share of gap must come from explain_gap itself. */
export function ungroundedIn(story: DraftStory, calls: readonly ToolCall[]): string[] {
  const source = JSON.stringify(calls.map((call) => call.output));
  const gapSource = JSON.stringify(calls.filter((call) => call.tool === GAP_TOOL).map((call) => call.output));
  const missing = numbersOf(story).filter((number) => !source.includes(number) && !source.includes(number.replaceAll(",", "")));
  const shares = story.causes.flatMap((cause) => (cause.shareOfGap && !gapSource.includes(cause.shareOfGap) ? [cause.shareOfGap] : []));
  return [...new Set([...missing, ...shares])];
}

type Checked = { draft: DraftStory; ungrounded: string[]; tooLong: string[] };

async function draftStories(model: LanguageModel, who: string, notes: string, calls: readonly ToolCall[], repair: readonly Checked[] = []): Promise<DraftStory[]> {
  const fix = repair.length > 0 ? ["Rewrite only these stories. `ungrounded` lists numbers no tool returned: replace them with numbers copied from the tool results, or leave them out. `tooLong` lists parts to shorten to the limit:", fenceAsData(JSON.stringify(repair))] : [];
  const { object } = await generateObject({
    model,
    schema: storiesSchema,
    system: STORY_SYSTEM,
    prompt: [`For: ${who}`, `A check's source is one of these tool names, spelled exactly: ${[...new Set(calls.map((call) => call.tool))].join(", ")}.`, "Analyst notes:", fenceAsData(notes), "Tool results:", fenceAsData(JSON.stringify(calls)), ...fix].join("\n"),
  });
  return object.stories;
}

/** The parts of a story longer than a glance allows. */
export function tooLongIn(story: DraftStory): string[] {
  const over = (text: string | null, limit: number) => text !== null && text.length > limit;
  return [
    ...(over(story.claim, LIMITS.claim) ? [`claim > ${LIMITS.claim}`] : []),
    ...(over(story.recommendation, LIMITS.recommendation) ? [`recommendation > ${LIMITS.recommendation}`] : []),
    ...story.checked.filter((entry) => over(entry.text, LIMITS.check)).map((entry) => `check "${entry.text}" > ${LIMITS.check}`),
    ...story.causes.filter((cause) => over(cause.detail, LIMITS.detail)).map((cause) => `detail "${cause.detail}" > ${LIMITS.detail}`),
  ];
}

function check(drafts: readonly DraftStory[], calls: readonly ToolCall[]): Checked[] {
  return drafts.map((draft) => ({ draft, ungrounded: ungroundedIn(draft, calls), tooLong: tooLongIn(draft) }));
}

function needsRewrite(entry: Checked): boolean {
  return entry.ungrounded.length > 0 || entry.tooLong.length > 0;
}

/** One person's morning investigation: read their open anomalies first, then the model drills into those with the read tools of their role and writes grounded stories; a story with a number no tool returned gets one rewrite, then is dropped. No anomalies means one quiet story and no model call. */
export async function investigate(userId: string, model: LanguageModel, modelId: string): Promise<InvestigationRun> {
  const user = findUser(userId);
  if (!user) throw new Error(`no user ${userId}`);
  const access = accessFor(user);
  const anomalies = await openAnomalies(access);
  if (anomalyRows(anomalies).length === 0) return quietRun(userId, modelId, anomalies);
  const who = `${user.nameTh} (${user.title}, role ${user.role}). Scope: ${scopeLine(access)}. ${orgLine(user)} Today is ${TODAY}.`;
  const { result, usage } = await measure(async () => {
    const run = await runWithAccess(access, () => generateText({ model, system: INVESTIGATE_SYSTEM, prompt: investigationPrompt(who, anomalies), tools: readTools(access), stopWhen: stepCountIs(MAX_STEPS) }));
    const calls = callsWithAnomalies(anomalies, run.steps.flatMap((step) => step.toolResults.map((toolResult) => ({ tool: toolResult.toolName, input: toolResult.input, output: toolResult.output }))));
    const first = check(await draftStories(model, who, run.text, calls), calls);
    const failed = first.filter(needsRewrite);
    const repaired = failed.length > 0 ? check(await draftStories(model, who, run.text, calls, failed), calls) : [];
    return { notes: run.text, calls, checked: [...first.filter((entry) => !needsRewrite(entry)), ...repaired] };
  });
  const checked = result.checked;
  const called = new Set(result.calls.map((call) => call.tool));
  const stories = checked.filter((entry) => entry.ungrounded.length === 0).map((entry, index) => withOwner(honestChecks(entry.draft, called), userId, `${userId}-${index}`));
  const dropped = checked.filter((entry) => entry.ungrounded.length > 0).map((entry) => ({ claim: entry.draft.claim, ungrounded: entry.ungrounded }));
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

/** The morning job: investigate for every user on the default real model and keep the result; does nothing when only the mock is configured. */
export async function runInvestigateJob(): Promise<number> {
  const [modelId, entry] = Object.entries(models())[0] ?? [];
  if (!modelId || modelId === MOCK_MODEL_ID || !entry || typeof entry !== "object" || !("model" in entry)) return 0;
  const model = typeof entry.model === "function" ? entry.model() : entry.model;
  const queue = USERS.map((user) => user.id);
  let saved = 0;
  const workers = Array.from({ length: JOB_CONCURRENCY }, async () => {
    for (let userId = queue.shift(); userId; userId = queue.shift()) {
      const run = await investigate(userId, model, modelId).catch((error: unknown) => {
        console.error(`[cop] investigation for ${userId} failed`, error);
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
