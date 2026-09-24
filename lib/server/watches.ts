import { randomUUID } from "node:crypto";
import type { AccessContext, MetricQuery, PersonalWatch, WatchCondition } from "@/lib/contracts";

export { conditionLabel };
import { liveAccessFor } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import { runMetric } from "@/lib/server/metrics";
import { ports } from "@/lib/server/ports";
import { checkWatch, conditionLabel, nextState, rollingQuery, windowDaysOf, type WatchHit } from "@/lib/engine/personal-watches";
import { formatMetricValue, formatDelta } from "@/lib/dashboard/metric-display";
import type { Dictionary } from "@/lib/semantic/dictionary";
import { loadDictionary } from "@/lib/server/master-data";
import { TH } from "@/lib/i18n/th";
import { rememberAction } from "@/lib/engine/memory";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { notifications, personalWatches } from "./agent/collections";

const MAX_WATCHES_PER_USER = 12;
const SYSTEM_SENDER = "cop";

export type WatchCreated = { ok: true; watch: PersonalWatch; now: string } | { ok: false; error: string };

function hitLabel(watch: PersonalWatch, hit: WatchHit, dictionary: Dictionary): string {
  const value = watch.condition.kind === "change" ? (formatDelta(hit.value) ?? "") : formatMetricValue(watch.query.metric, hit.value);
  const where = watch.query.dims
    .map((dim) => hit.row[dim])
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .map((part, index) => dictionary.displayLabel(watch.query.dims[index] ?? "region", part))
    .join(" · ");
  return where ? `${where} ${value}` : value;
}

/** Stores a standing question after checking it runs under the user's own scope; out-of-scope watches are refused, not stored. */
export async function createWatch(access: AccessContext, input: { title: string; query: MetricQuery; condition: WatchCondition }, at = new Date()): Promise<WatchCreated> {
  const mine = personalWatches().where((watch) => watch.userId === access.userId);
  if (mine.length >= MAX_WATCHES_PER_USER) return { ok: false, error: TH.watch.tooMany(MAX_WATCHES_PER_USER) };
  const windowDays = windowDaysOf(input.query);
  const draft = { query: input.query, windowDays, condition: input.condition };
  const result = await runMetric(rollingQuery(draft), access);
  if (!result.ok) return { ok: false, error: result.error };
  const check = checkWatch(result, input.condition);
  const watch: PersonalWatch = {
    id: randomUUID(),
    userId: access.userId,
    title: input.title,
    ...draft,
    createdAt: at.toISOString(),
    state: check.breached ? "triggered" : "ok",
    lastCheckedAt: at.toISOString(),
    lastTriggeredAt: check.breached ? at.toISOString() : null,
  };
  personalWatches().put(watch);
  rememberAction(access.userId, { type: "preference", value: TH.memory.threshold(metricLabel(input.query.metric), conditionLabel(input.query, input.condition)) });
  const now = check.hit ? hitLabel(watch, check.hit, await loadDictionary()) : TH.watch.clear;
  return { ok: true, watch, now };
}

export function watchesOf(userId: string): PersonalWatch[] {
  return personalWatches()
    .where((watch) => watch.userId === userId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function removeWatch(userId: string, id: string): boolean {
  const watch = personalWatches().get(id);
  if (!watch || watch.userId !== userId) return false;
  personalWatches().remove(id);
  return true;
}

async function tell(watch: PersonalWatch, hit: WatchHit): Promise<void> {
  const user = findUser(watch.userId);
  if (!user) return;
  const title = TH.watch.fired(watch.title, hitLabel(watch, hit, await loadDictionary()));
  const at = new Date().toISOString();
  notifications().put({ id: randomUUID(), userId: user.id, at, kind: "alert", refId: watch.id, read: false, title });
  await ports().mail.send({
    kind: "watch",
    fromUserId: SYSTEM_SENDER,
    toUserId: user.id,
    toEmail: user.email,
    subject: title,
    body: TH.watch.mailBody(conditionLabel(watch.query, watch.condition)),
    refId: watch.id,
  });
}

/** Re-asks every standing question under its owner's scope and tells the owner the first time a line is crossed. */
export async function runWatchJob(at = new Date()): Promise<{ checked: number; fired: number }> {
  let fired = 0;
  const watches = personalWatches().all();
  for (const watch of watches) {
    const user = findUser(watch.userId);
    if (!user) continue;
    const check = checkWatch(await runMetric(rollingQuery(watch), liveAccessFor(user)), watch.condition);
    const next = nextState(watch.state, check.breached);
    personalWatches().put({
      ...watch,
      state: next.state,
      lastCheckedAt: at.toISOString(),
      lastTriggeredAt: next.notify ? at.toISOString() : watch.lastTriggeredAt,
    });
    if (next.notify && check.hit) {
      await tell(watch, check.hit);
      fired += 1;
    }
  }
  return { checked: watches.length, fired };
}
