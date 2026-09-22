import type { AccessContext, ActionEvent, Dim, MetricId, QuickAction } from "@/lib/contracts";
import { actionEvents } from "@/lib/server/agent/collections";
import { USERS } from "@/lib/data/entities/users";
import { LENT_WINDOW_LABEL, seasonalHints } from "./seasons";
import { TH } from "@/lib/i18n/th";

const WINDOW_DAYS = 30;
const RECENCY_DAYS = 14;
const DAY_MS = 86_400_000;
const TOP_LEARNED = 4;
const TOP_SEASONAL = 2;
const BUCKET_HOURS = 6;
const WEIGHTS = { frequency: 0.35, recency: 0.25, timeOfDay: 0.15, peers: 0.15, context: 0.1, dismiss: 0.5 };

export type Scored = { intentKey: string; prompt: string; score: number; reason: string; metric: MetricId | null; dims: Dim[]; dismissed: number };

function bucketOf(iso: string): number {
  return Math.floor(new Date(iso).getUTCHours() / BUCKET_HOURS);
}

function daysAgo(iso: string, now: number): number {
  return (now - new Date(iso).getTime()) / DAY_MS;
}

function roleOf(userId: string): string {
  return USERS.find((user) => user.id === userId)?.role ?? "";
}

type Cluster = { intentKey: string; prompt: string; metric: MetricId | null; dims: Dim[]; count: number; last: string; buckets: number[]; dismissed: number };

function clusterOf(events: readonly ActionEvent[], now: number): Cluster[] {
  const clusters = new Map<string, Cluster>();
  for (const event of events) {
    if (!event.intentKey || daysAgo(event.at, now) > WINDOW_DAYS) continue;
    const found = clusters.get(event.intentKey) ?? {
      intentKey: event.intentKey,
      prompt: event.prompt ?? "",
      metric: event.metric,
      dims: event.dims,
      count: 0,
      last: event.at,
      buckets: [],
      dismissed: 0,
    };
    if (event.kind === "dismiss") found.dismissed += 1;
    else found.count += 1;
    if (event.at > found.last) {
      found.last = event.at;
      if (event.prompt) found.prompt = event.prompt;
    }
    found.buckets.push(bucketOf(event.at));
    clusters.set(event.intentKey, found);
  }
  return [...clusters.values()];
}

function peerLift(intentKey: string, access: AccessContext, all: readonly ActionEvent[]): number {
  const role = access.role;
  const peers = all.filter((event) => event.userId !== access.userId && roleOf(event.userId) === role);
  if (peers.length === 0) return 0;
  return peers.filter((event) => event.intentKey === intentKey).length / peers.length;
}

function contextSimilarity(cluster: Cluster, last: ActionEvent | null): number {
  if (!last || !last.metric) return 0;
  if (cluster.metric === last.metric) return 1;
  return cluster.dims.some((dim) => last.dims.includes(dim)) ? 0.5 : 0;
}

function reasonFor(cluster: Cluster, now: number): string {
  if (cluster.count >= 3) return TH.quick.askedOften(cluster.count, WINDOW_DAYS);
  if (daysAgo(cluster.last, now) < 2) return TH.quick.askedRecently;
  return TH.quick.fromYourHistory;
}

function labelOf(prompt: string): string {
  const trimmed = prompt.trim();
  return trimmed.length > 34 ? `${trimmed.slice(0, 34)}…` : trimmed;
}

/** The learned chips: how often, how recently, at what hour, what peers in the same role ask, and what the last turn was about. */
export function scoreIntents(access: AccessContext, now = Date.now(), events?: readonly ActionEvent[]): Scored[] {
  const all = events ?? actionEvents().all();
  const mine = all.filter((event) => event.userId === access.userId);
  const clusters = clusterOf(mine, now);
  if (clusters.length === 0) return [];
  const maxCount = Math.max(...clusters.map((cluster) => cluster.count), 1);
  const nowBucket = Math.floor(new Date(now).getUTCHours() / BUCKET_HOURS);
  const last = mine.slice().sort((left, right) => right.at.localeCompare(left.at))[0] ?? null;
  return clusters
    .map((cluster) => {
      const frequency = cluster.count / maxCount;
      const recency = Math.exp(-daysAgo(cluster.last, now) / RECENCY_DAYS);
      const timeOfDay = cluster.buckets.filter((bucket) => bucket === nowBucket).length / Math.max(1, cluster.buckets.length);
      const score =
        WEIGHTS.frequency * frequency +
        WEIGHTS.recency * recency +
        WEIGHTS.timeOfDay * timeOfDay +
        WEIGHTS.peers * peerLift(cluster.intentKey, access, all) +
        WEIGHTS.context * contextSimilarity(cluster, last) -
        WEIGHTS.dismiss * cluster.dismissed;
      return { intentKey: cluster.intentKey, prompt: cluster.prompt, score, reason: reasonFor(cluster, now), metric: cluster.metric, dims: cluster.dims, dismissed: cluster.dismissed };
    })
    .filter((scored) => scored.score > 0 && scored.prompt.length > 0)
    .sort((left, right) => right.score - left.score);
}

/** Top learned chips plus the calendar-driven ones, falling back to the role defaults on a cold start. */
export function quickActionsFrom(access: AccessContext, fallback: QuickAction[], now = Date.now(), events?: readonly ActionEvent[]): QuickAction[] {
  const seen = new Set<string>();
  const learned = scoreIntents(access, now, events)
    .filter((scored) => {
      if (scored.dismissed > 0 || seen.has(scored.prompt)) return false;
      seen.add(scored.prompt);
      return true;
    })
    .slice(0, TOP_LEARNED)
    .map((scored, index) => ({
      id: `qa_learned_${index}`,
      label: labelOf(scored.prompt),
      prompt: scored.prompt,
      score: Math.round(scored.score * 100) / 100,
      reason: scored.reason,
      intentKey: scored.intentKey,
    }));
  const seasonal = seasonalHints(access, now).slice(0, TOP_SEASONAL);
  const keys = new Set([...learned, ...seasonal].map((action) => action.intentKey));
  const filler = fallback.filter((action) => !keys.has(action.intentKey));
  return [...learned, ...seasonal, ...filler].slice(0, TOP_LEARNED + TOP_SEASONAL);
}

export { LENT_WINDOW_LABEL };
