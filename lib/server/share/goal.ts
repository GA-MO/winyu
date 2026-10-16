import { liveAccessFor } from "@/lib/access/enforce";
import { metricQueryInputSchema, type MetricQueryInput, type User } from "@/lib/contracts";
import { addDays, daysBetween, DATA_AS_OF } from "@/lib/data/dates";
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

function metricInputOf(read: SharedRead): MetricQueryInput | null {
  if (read.tool !== METRIC_READ) return null;
  const parsed = metricQueryInputSchema.safeParse(read.input);
  return parsed.success ? parsed.data : null;
}

function firstMetricInput(card: SharedCard): MetricQueryInput | null {
  return card.reads.map(metricInputOf).find((input) => input !== null) ?? null;
}

async function answerOf(input: MetricQueryInput, viewer: User): Promise<unknown> {
  const resolved = resolveQuery(input);
  return resolved.ok ? runMetric(resolved.query, liveAccessFor(viewer)) : null;
}

/** What the card's numbers say for the person sending it, from its first metric read run again under their access; null when the card has no metric read. No model call, no audit row: it never leaves the server except as figures. */
export async function cardFigures(card: SharedCard, viewer: User): Promise<CardFigures | null> {
  const input = firstMetricInput(card);
  return input ? figuresOf(await answerOf(input, viewer)) : null;
}

function targetGoal(input: MetricQueryInput): MatterGoal | null {
  const againstTarget = input.metric === "target_attainment" || (input.compare === "target" && TARGET_METRICS.has(input.metric));
  return againstTarget ? { kind: "attainment", query: { ...input }, atLeast: FULL_TARGET } : null;
}

/** What closes a matter by itself, when the card has it: an open alert it is about coming back within what was expected, else a card against target reaching 100% of it; null otherwise. */
export function goalOf(card: SharedCard, alertIds: readonly string[]): MatterGoal | null {
  const alert = alertIds.flatMap((id) => alerts().get(id) ?? []).find((candidate) => candidate.status === "open");
  if (alert) return { kind: "alert", alertId: alert.id };
  const input = firstMetricInput(card);
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
  const metric = metricInputOf({ tool: METRIC_READ, input: goal.query })?.metric;
  return metric ? TH.matter.goal.attainment(metricLabel(metric)) : TH.matter.goal.unknown;
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
