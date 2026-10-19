import { metricPairsOf } from "@/lib/cards/tool-answers";
import { groupDimsOf } from "@/lib/cards/rows";
import type { MetricQuery } from "@/lib/contracts";
import { UNCOMPOSABLE_TOOLS } from "@/lib/compose/ground";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { namesPerson, type Named } from "@/lib/share/recipients";
import type { ReplyStep, ToolStep } from "./timeline";

const DECLINED_TEXT = /not approved|declined|rejected|denied/i;
const LEFT_FOR_NEW_QUESTION = "LEFT_FOR_NEW_QUESTION";
const NOT_APPROVED = "NOT_APPROVED";
const ANSWER_LISTS = ["rows", "weeks", "data", "conversations"] as const;
const CATALOG_TOOL = "list_metrics";
const RECALL_TOOL = "recall_memory";
const METRIC_TOOL = "query_metric";
const GAP_TOOL = "explain_gap";
const ALERTS_TOOL = "get_alerts";
const PEOPLE_LOOKUPS: ReadonlySet<string> = new Set(["find_people", "get_person", "resolve_owner"]);
const ENTITY_LOOKUP = "describe_entity";
const USER_ENTITY = "user";
const ENTITY_LOOKUPS: ReadonlySet<string> = new Set([ENTITY_LOOKUP, ...PEOPLE_LOOKUPS]);
const LOOKUP_TOOLS: ReadonlySet<string> = new Set([CATALOG_TOOL, RECALL_TOOL, ...ENTITY_LOOKUPS]);

/** How one tool call shows in a reply: its card, the decision it waits on or its receipt, the receipt of a write that did nothing and why, a quiet note, or nothing (a call still running shows in the action trail). */
export type ToolView =
  | { kind: "card"; name: string; result: unknown; args: unknown }
  | { kind: "decision"; tool: string; input: unknown; approved: boolean | null; result?: unknown }
  | { kind: "not-done"; tool: string; reason: string | null }
  | { kind: "not-run" }
  | { kind: "none" };

/** What the live chat knows about one call beyond the transcript: whether a reply is streaming, whether this call waits for the person, what they chose, whether a new question left it behind (the server closes it then, but the live transcript never sees that result), and whether its card is left out (a composed card shows or may yet show its result, or another card of the exchange draws it). */
export type ToolLive = { running: boolean; asking: boolean; decided: boolean | undefined; left: boolean; hidden: boolean };

/** A write tool's result that says the person declined it rather than that it ran. */
export function isDeclined(result: unknown): boolean {
  if (typeof result === "string") return DECLINED_TEXT.test(result);
  if (typeof result !== "object" || result === null) return false;
  return (result as { approved?: unknown }).approved === false;
}

function isDone(result: unknown): boolean {
  return typeof result === "object" && result !== null && (result as { ok?: unknown }).ok === true;
}

/** A successful read that found nothing (no rows, no forecast weeks, an empty search, a recall with no facts and no past conversations): the reply says so in words, as the prompt asks, so no empty card is drawn. A report whose nothing is itself the answer (no one was denied) says so with `drawsWhenEmpty` and keeps its card (AI-279). */
export function isEmptyAnswer(result: unknown): boolean {
  if (typeof result !== "object" || result === null || (result as { ok?: unknown }).ok !== true) return false;
  if ((result as { drawsWhenEmpty?: unknown }).drawsWhenEmpty === true) return false;
  const lists = ANSWER_LISTS.map((key) => (result as Record<string, unknown>)[key]).filter(Array.isArray);
  return lists.length > 0 && lists.every((list) => list.length === 0);
}

/** A refusal (`ok: false`) or a call the runtime rejected before the tool ran (`error: true`, its arguments failed the schema). */
export function isRefused(result: unknown): boolean {
  if (typeof result !== "object" || result === null) return false;
  const { ok, error } = result as { ok?: unknown; error?: unknown };
  return ok === false || error === true;
}

function offersNextStep(result: unknown): boolean {
  const actions = typeof result === "object" && result !== null ? (result as { nextActions?: unknown }).nextActions : null;
  return Array.isArray(actions) && actions.length > 0;
}

/** A read result that draws no card: an empty answer, or a refusal or failure (its text is written for the model, and the reply tells the person in words); a scope refusal that offers a way to more (a request for a temporary grant) still draws, so the button is there. */
export function drawsNoCard(result: unknown): boolean {
  return isEmptyAnswer(result) || (isRefused(result) && !offersNextStep(result));
}

/** Why a write did nothing, in the person's words: a refusal whose text is written for the model (card refs, instructions) has its own line by code. */
function reasonOf(result: unknown): string | null {
  if (typeof result !== "object" || result === null) return null;
  const { code, error } = result as { code?: unknown; error?: unknown };
  const forPerson = typeof code === "string" ? TH.conversation.notDoneWhy[code] : undefined;
  if (forPerson) return forPerson;
  return typeof error === "string" && error.trim() ? error : null;
}

function cardView(step: ToolStep, live: ToolLive): ToolView {
  if (live.hidden) return { kind: "none" };
  if (step.outcome.state === "returned" && drawsNoCard(step.outcome.result)) return { kind: "none" };
  if (step.outcome.state === "returned") return { kind: "card", name: step.name, result: step.outcome.result, args: step.args };
  return { kind: "none" };
}

function writeView(step: ToolStep, live: ToolLive): ToolView {
  const decision = { kind: "decision" as const, tool: step.name, input: step.args };
  if (live.asking) return { ...decision, approved: live.decided ?? null };
  if (step.outcome.state === "returned") {
    if (isDeclined(step.outcome.result)) return { ...decision, approved: false };
    if (isDone(step.outcome.result)) return { ...decision, approved: true, result: step.outcome.result };
    return live.hidden ? { kind: "none" } : { kind: "not-done", tool: step.name, reason: reasonOf(step.outcome.result) };
  }
  if (step.outcome.state === "failed") return { kind: "none" };
  if (live.left) return { kind: "not-done", tool: step.name, reason: reasonOf({ code: LEFT_FOR_NEW_QUESTION }) };
  return live.running ? { kind: "none" } : { kind: "not-run" };
}

/** Picks how a tool call is drawn: read tools with a card in `cardTools` draw their result; every other tool is a write the person decides on, then a receipt. */
export function toolViewOf(step: ToolStep, live: ToolLive, cardTools: ReadonlySet<string>): ToolView {
  return cardTools.has(step.name) ? cardView(step, live) : writeView(step, live);
}

function holdsCard(step: ReplyStep): boolean {
  return step.kind === "composed" && step.surface.components.length > 0;
}

/** Whether the reply wrote a card block of its own, whether or not anything in it held. */
export function wroteBlock(steps: readonly ReplyStep[]): boolean {
  return steps.some((step) => step.kind === "composed");
}

/** The read calls of one exchange whose fixed card is not drawn: once a composed card holds, it is the answer and every composable result stays inside it; while the reply still streams, a card block may yet come, so none flashes up first. A block where nothing held leaves the fixed cards as the fallback. */
export function composedCalls(steps: readonly ReplyStep[], streaming: boolean): ReadonlySet<string> {
  if (!streaming && !steps.some(holdsCard)) return new Set();
  return new Set(steps.flatMap((step) => (step.kind === "tool" && !UNCOMPOSABLE_TOOLS.includes(step.name) ? [step.toolCallId] : [])));
}

/** How the fixed cards of one exchange are drawn: the calls whose card is left out, and the metric cards that draw other answers with their own. */
export type CardPlan = { hidden: ReadonlySet<string>; paired: ReadonlyMap<string, readonly string[]> };

function answered(step: ToolStep): boolean {
  return step.outcome.state === "returned" && !isRefused(step.outcome.result);
}

function rejectedBeforeRunning(step: ToolStep): boolean {
  return step.outcome.state === "returned" && (step.outcome.result as { error?: unknown } | null)?.error === true;
}

function refusedWrite(step: ToolStep, cardTools: ReadonlySet<string>): boolean {
  return !cardTools.has(step.name) && step.outcome.state === "returned" && isRefused(step.outcome.result);
}

function decidedByPerson(step: ToolStep): boolean {
  return step.outcome.state === "returned" && (isDeclined(step.outcome.result) || (step.outcome.result as { code?: unknown } | null)?.code === NOT_APPROVED);
}

/** Whether `later` is the model calling the tool again after `step` failed: it answered; or `step` never ran (its arguments failed the schema, or a write the server refused before acting) and the later call waits for the person or they decided on it, so the attempt they decide on stands alone (AI-292). */
function retried(step: ToolStep, later: ToolStep, cardTools: ReadonlySet<string>): boolean {
  if (later.name !== step.name) return false;
  if (answered(later)) return true;
  const neverRan = rejectedBeforeRunning(step) || refusedWrite(step, cardTools);
  return neverRan && (later.outcome.state === "pending" || decidedByPerson(later));
}

/** A refusal that offers a way to more (a request for a temporary grant) is an answer of its own: a later call of the tool asked something else, such as the other side of a comparison (AI-211). */
function offersWayOn(step: ToolStep): boolean {
  return step.outcome.state === "returned" && isRefused(step.outcome.result) && offersNextStep(step.outcome.result);
}

/** Failed calls the model made again: corrected when a later call of the tool answered, and a call the runtime rejected before it ran (its arguments failed the schema) as soon as a later call of the tool is waiting, so a retry that waits for approval stands alone; a refusal that offers a request for access is never one. */
function recoveredFailures(steps: readonly ToolStep[], cardTools: ReadonlySet<string>): string[] {
  return steps.flatMap((step, index) => {
    if (answered(step) || step.outcome.state === "pending" || offersWayOn(step)) return [];
    return steps.slice(index + 1).some((later) => retried(step, later, cardTools)) ? [step.toolCallId] : [];
  });
}

function drawsAnswer(step: ToolStep, hidden: ReadonlySet<string>, cardTools: ReadonlySet<string>): boolean {
  if (LOOKUP_TOOLS.has(step.name) || !cardTools.has(step.name) || hidden.has(step.toolCallId)) return false;
  return step.outcome.state === "returned" && !drawsNoCard(step.outcome.result);
}

function searchesCatalog(step: ToolStep): boolean {
  const search = (step.args as { search?: unknown } | null)?.search;
  return step.name === CATALOG_TOOL && typeof search === "string" && search.trim() !== "";
}

function plumbing(step: ToolStep, way: { answers: boolean; acts: boolean; searched: boolean; blockWritten: boolean }): boolean {
  if (!LOOKUP_TOOLS.has(step.name)) return false;
  if (way.answers || way.acts) return true;
  if (ENTITY_LOOKUPS.has(step.name)) return !way.blockWritten;
  return way.searched && step.name === CATALOG_TOOL;
}

/** Lookups (the metric catalog, owners, people, entities, memory) are the way to an answer, not the answer: once another card of the exchange answers, or the exchange acts (a send, an email), they draw nothing; a person, owner or entity found for a reply that wrote no card block of its own (a refusal, an answer in words) draws nothing either, so a profile or an owner card never stands in for a refusal; and the catalog searched for a metric never does, whether the metric was then asked for or the reply refused. */
function plumbingLookups(steps: readonly ToolStep[], hidden: ReadonlySet<string>, cardTools: ReadonlySet<string>, blockWritten: boolean): string[] {
  const way = { answers: steps.some((step) => drawsAnswer(step, hidden, cardTools)), acts: steps.some((step) => !cardTools.has(step.name)), searched: steps.some(searchesCatalog), blockWritten };
  return steps.flatMap((step) => (plumbing(step, way) ? [step.toolCallId] : []));
}

function recipientsAskedFor(step: ToolStep): string[] {
  const args = step.args as { toUserId?: unknown; to?: unknown } | null;
  if (typeof args !== "object" || args === null) return [];
  if (typeof args.toUserId === "string") return [args.toUserId];
  return Array.isArray(args.to) ? args.to.filter((name): name is string => typeof name === "string") : [];
}

function namedOf(row: unknown): Named | null {
  if (typeof row !== "object" || row === null) return null;
  const person = row as { id?: unknown; userId?: unknown; name?: unknown; nameTh?: unknown; title?: unknown };
  const id = typeof person.id === "string" ? person.id : typeof person.userId === "string" ? person.userId : null;
  if (!id) return null;
  const nameTh = typeof person.nameTh === "string" ? person.nameTh : typeof person.name === "string" ? person.name : findUser(id)?.nameTh;
  if (!nameTh) return null;
  return { id, nameTh, ...(typeof person.title === "string" ? { title: person.title } : {}) };
}

function looksUpPeople(step: ToolStep): boolean {
  if (PEOPLE_LOOKUPS.has(step.name)) return true;
  return step.name === ENTITY_LOOKUP && (step.args as { kind?: unknown } | null)?.kind === USER_ENTITY;
}

function peopleFound(step: ToolStep): Named[] {
  if (!looksUpPeople(step) || step.outcome.state !== "returned") return [];
  const data = (step.outcome.result as { data?: unknown } | null)?.data;
  return (Array.isArray(data) ? data : [data]).flatMap((row) => namedOf(row) ?? []);
}

/** Every memory recall of the exchange but the last that answered: each recall in a turn returns all the turn has recalled, so the last one is the whole of it and the reply draws one memory card. */
function earlierRecalls(steps: readonly ToolStep[]): string[] {
  const recalls = steps.filter((step) => step.name === RECALL_TOOL && answered(step));
  return recalls.slice(0, -1).map((step) => step.toolCallId);
}

/** People lookups (a colleague found by name, team, owner or user record) that found whom a later call of the exchange sends something to (a card, an email): the lookup was the way to the action, so its card is not the answer. */
function recipientLookups(steps: readonly ToolStep[]): string[] {
  return steps.flatMap((step, index) => {
    const found = peopleFound(step);
    if (found.length === 0) return [];
    const asked = steps.slice(index + 1).flatMap(recipientsAskedFor);
    return asked.some((name) => found.some((person) => namesPerson(name, person))) ? [step.toolCallId] : [];
  });
}

type GapAsked = { metric: unknown; compare: unknown; range: { from?: unknown; to?: unknown } | null; period: unknown; filters: string; monthEnd: boolean };

function filtersKey(filters: unknown): string {
  if (typeof filters !== "object" || filters === null) return "";
  const entries = Object.entries(filters as Record<string, unknown>).map(([dim, values]) => [dim, [values ?? []].flat().map(String).sort()] as const);
  return JSON.stringify(entries.filter(([, values]) => values.length > 0).sort(([left], [right]) => left.localeCompare(right)));
}

/** The gaps the exchange explained (explain_gap answered), as they were asked, with whether they found no main cause (`share_note` set). */
function gapsAnswered(steps: readonly ToolStep[]): { asked: GapAsked; spread: boolean }[] {
  return steps.flatMap((step) => {
    if (step.name !== GAP_TOOL || !answered(step) || step.outcome.state !== "returned") return [];
    const args = (step.args ?? {}) as { metric?: unknown; compare?: unknown; range?: { from?: unknown; to?: unknown }; filters?: unknown };
    const { share_note: note, period_label: period, projection } = (step.outcome.result as { share_note?: unknown; period_label?: unknown; projection?: unknown } | null) ?? {};
    const monthEnd = typeof projection === "object" && projection !== null;
    return [{ asked: { metric: args.metric, compare: args.compare, range: args.range ?? null, period: period ?? null, filters: filtersKey(args.filters), monthEnd }, spread: typeof note === "string" && note.trim() !== "" }];
  });
}

type MetricAnswered = { query?: Partial<MetricQuery> & { scopeApplied?: Record<string, unknown> }; rows?: unknown[]; headline?: { periodLabel?: unknown; projection?: unknown; asksMonthEnd?: unknown } };

/** Whether a metric answer reads the window a gap read: the same dates asked, or the same days both tools say they read ("1 พ.ย. 2569 – 26 พ.ย. 2569" when the gap was asked to a day past the data). */
function sameWindow(answer: MetricAnswered, gap: GapAsked): boolean {
  const range = answer.query?.range;
  if (range && range.from === gap.range?.from && range.to === gap.range?.to) return true;
  return typeof gap.period === "string" && answer.headline?.periodLabel === gap.period;
}

/** Whether a metric answer covers the slice a gap read: the filters asked, or what they came to with the asker's own scope (an RSM's ภาคอีสาน). */
function sameSlice(step: ToolStep, answer: MetricAnswered, gap: GapAsked): boolean {
  const args = (step.args ?? {}) as { filters?: unknown };
  if (filtersKey(args.filters) === gap.filters) return true;
  return filtersKey({ ...answer.query?.scopeApplied, ...answer.query?.filters }) === gap.filters;
}

/** Whether a metric answer was asked where the running month closes and projects it, so its card leads with the month end. */
function closesMonth(answer: MetricAnswered): boolean {
  return answer.headline?.asksMonthEnd === true && typeof answer.headline.projection === "object" && answer.headline.projection !== null;
}

/** A total, or a breakdown that came back as one row, of the metric, comparison, window and slice a gap read: the gap card leads with the same figure. So does a breakdown asked where the month closes beside a gap that projects the month end: both lead with the month end, and the gap card holds the parts under it (AI-293). */
function repeatsGap(step: ToolStep, gap: GapAsked): boolean {
  if (step.name !== METRIC_TOOL || !answered(step) || step.outcome.state !== "returned") return false;
  const answer = (step.outcome.result ?? {}) as MetricAnswered;
  const query = answer.query;
  if (!query?.range || !query.dims) return false;
  const oneFigure = groupDimsOf(query as MetricQuery).length === 0 || answer.rows?.length === 1;
  const sameMonthEnd = gap.monthEnd && closesMonth(answer);
  return (oneFigure || sameMonthEnd) && query.metric === gap.metric && query.compare === gap.compare && sameWindow(answer, gap) && sameSlice(step, answer, gap);
}

/** One card per point in a why answer (AI-253): a metric total with no breakdown over the metric, window, comparison and filters of a gap the exchange explained repeats the gap card's lead, and an alert list beside a company-wide gap that found no main cause reads as the cause the gap card says there is not. */
function repeatedByGap(steps: readonly ToolStep[]): string[] {
  const gaps = gapsAnswered(steps);
  if (gaps.length === 0) return [];
  const spreadAcrossCompany = gaps.some((gap) => gap.spread && gap.asked.filters === filtersKey({}));
  return steps.flatMap((step) => {
    if (gaps.some((gap) => repeatsGap(step, gap.asked))) return [step.toolCallId];
    return spreadAcrossCompany && step.name === ALERTS_TOOL ? [step.toolCallId] : [];
  });
}

function metricPairs(steps: readonly ToolStep[], hidden: ReadonlySet<string>): ReadonlyMap<string, readonly string[]> {
  const results = steps.flatMap((step) => (step.name === METRIC_TOOL && step.outcome.state === "returned" && !hidden.has(step.toolCallId) ? [{ id: step.toolCallId, result: step.outcome.result }] : []));
  return metricPairsOf(results);
}

/** The results a paired card draws with its own: the answers of the calls `plan.paired` lists for it, in call order. */
export function pairedResultsOf(plan: CardPlan, steps: readonly ToolStep[], toolCallId: string): unknown[] {
  const partners = plan.paired.get(toolCallId) ?? [];
  return steps.flatMap((step) => (partners.includes(step.toolCallId) && step.outcome.state === "returned" ? [step.outcome.result] : []));
}

/** One card per question: a composed card holds only read results, so a write's receipt is never left out for it; a people lookup that found the recipient of a later card or email sent in the exchange is left out, a refused or failed call the model corrected later in the exchange (the same tool answered after it) is left out, metric answers of the same dimensions and range that pair draw one card on the first of them (`paired`), and lookups the model made on the way are left out (`plumbingLookups`); `composed` are the calls a composed card already holds, `blockWritten` whether the reply wrote a card block at all (a shared card, drawn as it is, counts as one). */
export function cardPlanOf(steps: readonly ToolStep[], composed: ReadonlySet<string>, cardTools: ReadonlySet<string>, blockWritten = true): CardPlan {
  const heldInCard = steps.flatMap((step) => (composed.has(step.toolCallId) && cardTools.has(step.name) ? [step.toolCallId] : []));
  const hidden = new Set([...heldInCard, ...recoveredFailures(steps, cardTools), ...recipientLookups(steps), ...earlierRecalls(steps), ...repeatedByGap(steps)]);
  const paired = metricPairs(steps, hidden);
  for (const partners of paired.values()) for (const id of partners) hidden.add(id);
  for (const id of plumbingLookups(steps, hidden, cardTools, blockWritten)) hidden.add(id);
  return { hidden, paired };
}
