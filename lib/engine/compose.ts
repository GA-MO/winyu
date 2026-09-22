import { generateObject } from "ai";
import { z } from "zod";
import type { AccessContext, ActionEvent, Dim, Grain, MetricId, MetricQuery, WidgetKind, WidgetSpec } from "@/lib/contracts";
import { actionEvents } from "@/lib/server/agent/collections";
import { TODAY, addDays } from "@/lib/data/dates";
import { metricDef } from "@/lib/semantic/metrics";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { models } from "@/lib/server/models";
import { TH } from "@/lib/i18n/th";

const CLUSTER_DAYS = 14;
const MIN_REPEATS = 3;
const PROMOTE_AT = 3;
const MAX_NEW_PER_DAY = 1;
const DAY_MS = 86_400_000;
const RANGE_DAYS = 27;
const ROW_LIMIT = 8;
const MOCK_MODEL = "mock";
const TIME_DIMS: readonly Dim[] = ["date", "week", "month"];

export type Candidate = { intentKey: string; metric: MetricId; dims: Dim[]; count: number; prompt: string };

const titleSchema = z.object({ title: z.string().min(4).max(48) });

function daysAgo(iso: string, now: number): number {
  return (now - new Date(iso).getTime()) / DAY_MS;
}

/** Question intents the user repeated often enough to be worth a permanent card. */
export function candidatesFrom(events: readonly ActionEvent[], userId: string, now = Date.now()): Candidate[] {
  const clusters = new Map<string, Candidate>();
  for (const event of events) {
    if (event.userId !== userId || event.kind === "dismiss" || !event.intentKey || !event.metric) continue;
    if (daysAgo(event.at, now) > CLUSTER_DAYS) continue;
    const found = clusters.get(event.intentKey) ?? { intentKey: event.intentKey, metric: event.metric, dims: event.dims, count: 0, prompt: event.prompt ?? "" };
    found.count += 1;
    if (event.prompt) found.prompt = event.prompt;
    clusters.set(event.intentKey, found);
  }
  return [...clusters.values()].filter((candidate) => candidate.count >= MIN_REPEATS).sort((left, right) => right.count - left.count);
}

export function kindFor(dims: Dim[]): WidgetKind {
  if (dims.length === 0) return "metric";
  if (dims.some((dim) => TIME_DIMS.includes(dim))) return "line";
  return "bar";
}

function grainFor(dims: Dim[]): Grain {
  if (dims.includes("month")) return "month";
  if (dims.includes("week")) return "week";
  return "day";
}

export function queryFor(candidate: Candidate, access: AccessContext): MetricQuery {
  const def = metricDef(candidate.metric);
  const dims = candidate.dims.filter((dim) => def?.dims.includes(dim));
  const filters = access.regions === "all" || access.regions.length === 0 ? {} : { region: [...access.regions] };
  return {
    metric: candidate.metric,
    dims,
    filters,
    range: { from: addDays(TODAY, -RANGE_DAYS), to: TODAY },
    grain: grainFor(dims),
    compare: "prev_period",
    limit: ROW_LIMIT,
  };
}

function templateTitle(candidate: Candidate): string {
  const dim = candidate.dims.find((entry) => !TIME_DIMS.includes(entry));
  return dim ? `${metricLabel(candidate.metric)}ตาม${TH.dim[dim]}` : metricLabel(candidate.metric);
}

async function modelTitle(candidate: Candidate): Promise<string | null> {
  const registry = models();
  const [id] = Object.keys(registry);
  const entry = id ? registry[id] : undefined;
  if (!id || id === MOCK_MODEL || !entry || typeof entry !== "object" || !("model" in entry)) return null;
  try {
    const result = await generateObject({
      model: typeof entry.model === "function" ? entry.model() : entry.model,
      schema: titleSchema,
      system: TH.compose.titlePrompt,
      prompt: `${candidate.prompt}\n${metricLabel(candidate.metric)}`,
    });
    return result.object.title;
  } catch {
    return null;
  }
}

function suggestedToday(existing: WidgetSpec[], now: number): number {
  const today = new Date(now).toISOString().slice(0, 10);
  return existing.filter((widget) => widget.source === "ai_suggested" && widget.createdAt.slice(0, 10) === today).length;
}

function sameSlice(widget: WidgetSpec, candidate: Candidate): boolean {
  return widget.query.metric === candidate.metric && [...widget.query.dims].sort().join(",") === [...candidate.dims].sort().join(",");
}

/** At most one new suggested card a day, never one the user already has. */
export async function composeSuggestion(access: AccessContext, existing: WidgetSpec[], now = Date.now(), events?: readonly ActionEvent[]): Promise<WidgetSpec | null> {
  if (suggestedToday(existing, now) >= MAX_NEW_PER_DAY) return null;
  const candidates = candidatesFrom(events ?? actionEvents().all(), access.userId, now);
  const fresh = candidates.find(
    (candidate) => access.metricAcl[candidate.metric] === "full" && !existing.some((widget) => sameSlice(widget, candidate)),
  );
  if (!fresh) return null;
  const title = (await modelTitle(fresh)) ?? templateTitle(fresh);
  return {
    id: `w_ai_${access.userId}_${fresh.intentKey.replace(/[|,]/g, "_")}`,
    userId: access.userId,
    title,
    kind: kindFor(fresh.dims),
    query: queryFor(fresh, access),
    pinned: false,
    position: existing.length,
    source: "ai_suggested",
    reason: TH.compose.reason(fresh.count, CLUSTER_DAYS),
    createdAt: new Date(now).toISOString(),
    version: 1,
  };
}

/** The one intent this user has repeated exactly enough times for the chat to offer a pin. */
export function repeatedIntent(userId: string, now = Date.now(), events?: readonly ActionEvent[]): { metric: MetricId; count: number } | null {
  const hit = candidatesFrom(events ?? actionEvents().all(), userId, now).find((candidate) => candidate.count === PROMOTE_AT);
  return hit ? { metric: hit.metric, count: hit.count } : null;
}

/** True once the user has asked the same thing often enough that the chat should offer to pin it. */
export function shouldOfferPin(userId: string, intentKey: string, now = Date.now(), events?: readonly ActionEvent[]): boolean {
  if (!intentKey) return false;
  const repeats = (events ?? actionEvents().all()).filter(
    (event) => event.userId === userId && event.intentKey === intentKey && daysAgo(event.at, now) <= CLUSTER_DAYS,
  ).length;
  return repeats === PROMOTE_AT;
}

export { CLUSTER_DAYS, MIN_REPEATS, PROMOTE_AT };
