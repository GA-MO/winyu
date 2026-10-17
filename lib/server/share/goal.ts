import { liveAccessFor } from "@/lib/access/enforce";
import { metricAccess } from "@/lib/access/grants";
import { presentCard } from "@/lib/cards/present";
import { isTimeDim, labelAlong } from "@/lib/cards/rows";
import { metricQueryInputSchema, type Dim, type MetricQueryInput, type MetricResult, type User } from "@/lib/contracts";
import { addDays, daysBetween, DATA_AS_OF } from "@/lib/data/dates";
import { agentById } from "@/lib/data/entities/agents";
import { loadDictionary } from "@/lib/server/master-data";
import { findUser } from "@/lib/data/entities/users";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";
import { resolveQuery } from "@/lib/semantic/periods";
import { TARGET_METRICS } from "@/lib/semantic/metrics";
import type { SharedCard, SharedRead } from "@/lib/share/card";
import { figuresOf, type CardFigures } from "@/lib/share/figures";
import type { Matter, MatterGoal } from "@/lib/share/matter";
import { goalMetOn } from "@/lib/share/matter-actions";
import { alerts } from "@/lib/server/agent/collections";
import { recordMatterEvent } from "@/lib/server/audit";
import { runMetric } from "@/lib/server/metrics";
import { notify } from "@/lib/server/notify";
import { shares } from "./shares";

const FULL_TARGET = 100;
const METRIC_READ = "query_metric";
const WINYU = "winyu";

type MetricAnswer = Extract<MetricResult, { ok: true }>;

function metricInputOf(read: SharedRead): MetricQueryInput | null {
  if (read.tool !== METRIC_READ) return null;
  const parsed = metricQueryInputSchema.safeParse(read.input);
  return parsed.success ? parsed.data : null;
}

function firstMetricInput(card: SharedCard): MetricQueryInput | null {
  return card.reads.map(metricInputOf).find((input) => input !== null) ?? null;
}

/** One stored read run as this person the way query_metric runs it for them: resolved, widened by a live grant on its metric, and read. No question narrows it, because the read was stored as its sender saw it. */
async function answerOf(input: MetricQueryInput, viewer: User): Promise<MetricResult | null> {
  const resolved = resolveQuery(input);
  if (!resolved.ok) return null;
  return runMetric(resolved.query, metricAccess(liveAccessFor(viewer), resolved.query.metric, new Date()).access);
}

function groupDims(input: Pick<MetricQueryInput, "dims">): Dim[] {
  return input.dims.filter((dim) => !isTimeDim(dim));
}

function showsRows(answer: MetricAnswer, labels: readonly string[]): boolean {
  const dims = groupDims(answer.query);
  return dims.length > 0 && answer.rows.some((row) => labels.includes(labelAlong(dims, row) ?? ""));
}

/** Every metric read of the card (a paired card draws several) run again under this person's access, in the card's order; reads that no longer resolve are left out. No model call, no audit row. */
export async function cardAnswers(card: SharedCard, viewer: User): Promise<MetricResult[]> {
  const inputs = card.reads.map(metricInputOf).filter((input): input is MetricQueryInput => input !== null);
  const answers = await Promise.all(inputs.map((input) => answerOf(input, viewer)));
  return answers.filter((answer): answer is MetricResult => answer !== null);
}

/** The card's first metric read run again under this person's access; null when the card has none or it no longer resolves. No model call, no audit row. */
export async function cardAnswer(card: SharedCard, viewer: User): Promise<MetricResult | null> {
  const input = firstMetricInput(card);
  return input ? answerOf(input, viewer) : null;
}

/** What the card's numbers say for the person sending it, from its first metric read run again under their access; null when the card has no metric read. It never leaves the server except as figures. */
export async function cardFigures(card: SharedCard, viewer: User): Promise<CardFigures | null> {
  return figuresOf(await cardAnswer(card, viewer));
}

/** The hero a card draws for one answer with `labels` as the rows asked about, as words: label, value, change and its base. */
export function askedHero(answer: MetricAnswer, labels: readonly string[]): string | null {
  const hero = presentCard({ title: "", query: answer.query, result: { ...answer, headline: { ...answer.headline, asked: [...labels] } } }).hero;
  return hero ? [hero.label, hero.value, hero.unit, hero.delta, hero.detail].filter(Boolean).join(" ") : null;
}

/** The card's headline figure for this person, as words a reply can quote: with rows the matter singles out, the hero the card leads with for them (the matter page draws the same); else the share of the whole month's target while the month runs, else its headline value; null when the card has no metric read or it no longer answers. */
export async function cardHero(card: SharedCard, viewer: User, focus: readonly string[] = []): Promise<string | null> {
  if (focus.length > 0) {
    const answers = (await cardAnswers(card, viewer)).filter((answer): answer is MetricAnswer => answer.ok);
    const showing = answers.find((answer) => showsRows(answer, focus));
    if (showing) return askedHero(showing, focus);
  }
  const input = firstMetricInput(card);
  const answer = input ? await answerOf(input, viewer) : null;
  if (!answer?.ok) return null;
  const { headline } = answer;
  return headline.projection ? `${headline.projection.attainmentToDate} ${TH.read.ofMonthTarget}` : headline.value;
}

function targetGoal(input: MetricQueryInput): MatterGoal | null {
  const againstTarget = input.metric === "target_attainment" || (input.compare === "target" && TARGET_METRICS.has(input.metric));
  return againstTarget ? { kind: "attainment", query: { ...input }, atLeast: FULL_TARGET } : null;
}

/** The card's read that is broken down by the one row a send singles out, narrowed to that row; null unless `focus` names exactly one row along a read's single group dim. */
async function focusedInput(card: SharedCard, focus: readonly string[]): Promise<MetricQueryInput | null> {
  if (focus.length !== 1) return null;
  const dictionary = await loadDictionary();
  for (const input of card.reads.map(metricInputOf)) {
    const dims = input ? groupDims(input) : [];
    const id = input && dims.length === 1 ? dictionary.resolveDimValue(dims[0], focus[0]) : null;
    if (input && id) return { ...input, filters: { ...input.filters, [dims[0]]: [id] }, limit: null, sort: null };
  }
  return null;
}

/** What closes a matter by itself, when the card has it: an open alert it is about coming back within what was expected, else a card against target reaching 100% of it, about the one row the send singles out when it singles one out; null otherwise. */
export async function goalOf(card: SharedCard, alertIds: readonly string[], focus: readonly string[] = []): Promise<MatterGoal | null> {
  const alert = alertIds.flatMap((id) => alerts().get(id) ?? []).find((candidate) => candidate.status === "open");
  if (alert) return { kind: "alert", alertId: alert.id };
  const input = (await focusedInput(card, focus)) ?? firstMetricInput(card);
  return input ? targetGoal(input) : null;
}

/** The goal's read moved to the latest data day: a named period resolves on today's clock by itself; dates keep their length and end on DATA_AS_OF. */
export function onLatestDay(input: MetricQueryInput, asOf: string = DATA_AS_OF): MetricQueryInput {
  if (input.period || !input.range || input.range.to >= asOf) return input;
  const days = daysBetween(input.range.from, input.range.to);
  return { ...input, range: { from: addDays(asOf, -days), to: asOf } };
}

/** Attainment against target in percent on the latest data day for this person, or null when the read no longer answers. */
export async function attainmentNow(goal: Extract<MatterGoal, { kind: "attainment" }>, viewer: User, asOf: string = DATA_AS_OF): Promise<number | null> {
  const parsed = metricQueryInputSchema.safeParse(goal.query);
  if (!parsed.success) return null;
  return figuresOf(await answerOf(onLatestDay(parsed.data, asOf), viewer))?.attainment ?? null;
}

/** Whether the goal is reached now: attainment at or over its line under the sender's access, or the alert resolved by the anomaly engine (its window ended and the number came back). */
export async function goalReached(goal: MatterGoal, sender: User, asOf: string = DATA_AS_OF): Promise<boolean> {
  if (goal.kind === "alert") return alerts().get(goal.alertId)?.status === "resolved";
  const attainment = await attainmentNow(goal, sender, asOf);
  return attainment !== null && attainment >= goal.atLeast;
}

/** The goal as one line for the sheet and the matter page. */
export function goalLabel(goal: MatterGoal): string {
  if (goal.kind === "alert") {
    const alert = alerts().get(goal.alertId);
    return alert ? TH.matter.goal.back(metricLabel(alert.metric)) : TH.matter.goal.unknown;
  }
  const input = metricInputOf({ tool: METRIC_READ, input: goal.query });
  if (!input) return TH.matter.goal.unknown;
  const agents = input.filters.agent ?? [];
  const agent = agents.length === 1 ? agentById(agents[0]) : null;
  return TH.matter.goal.attainment(agent ? `${metricLabel(input.metric)} ${agent.nameTh}` : metricLabel(input.metric));
}

function closeOnGoal(matter: Matter, at: Date): void {
  const step = goalMetOn(matter, at.toISOString());
  const stored = shares().put(step.matter);
  recordMatterEvent({ userId: WINYU, code: stored.id, action: "goal_met", toUserId: null, refusal: null });
  for (const telling of step.tell) notify(telling.userId, null, { kind: "matter_update", refId: stored.id, actorName: TH.notifications.winyu, cardTitle: stored.title, change: "goal_met", text: null }, at);
}

/** Checks every open matter that has a goal on the latest data day, under its sender's access: one that reaches its goal gains a goal_met line, closes, and tells each person on its path once. A closed matter is never checked again, so a second run tells nobody twice. */
export async function runGoalChecks(at = new Date(), asOf: string = DATA_AS_OF): Promise<{ checked: number; closed: number }> {
  const open = shares().where((matter) => matter.status === "open" && matter.goal !== null);
  let closed = 0;
  for (const matter of open) {
    const sender = findUser(matter.senderId);
    if (!sender || !matter.goal) continue;
    if (!(await goalReached(matter.goal, sender, asOf))) continue;
    closeOnGoal(matter, at);
    closed += 1;
  }
  return { checked: open.length, closed };
}
