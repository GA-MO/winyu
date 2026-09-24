import { jobRuns } from "./agent/collections";
import { runEngineJobs } from "./alerts";
import { runDigestJob } from "./digest";
import { runWatchJob } from "./watches";

const TICK_MS = 5 * 60_000;
const HOUR_MS = 60 * 60_000;
const BANGKOK_OFFSET_MS = 7 * HOUR_MS;
const DIGEST_HOUR = 7;
const STARTED = Symbol.for("cop.scheduler.started");

type Due = "engine" | "watches" | "digest";

type SchedulerGlobal = typeof globalThis & { [STARTED]?: ReturnType<typeof setInterval> };

function bangkokOf(now: number): { day: string; hour: number } {
  const local = new Date(now + BANGKOK_OFFSET_MS);
  return { day: local.toISOString().slice(0, 10), hour: local.getUTCHours() };
}

/** Which jobs are due at this moment: the engine once a local day, watches every hour, the digest once a day from 07:00. */
export function dueJobs(now: number, last: Partial<Record<Due, { lastRunAt: string; lastRunDay: string }>>): Due[] {
  const { day, hour } = bangkokOf(now);
  const due: Due[] = [];
  if (last.engine?.lastRunDay !== day) due.push("engine");
  if (!last.watches || now - Date.parse(last.watches.lastRunAt) >= HOUR_MS) due.push("watches");
  if (hour >= DIGEST_HOUR && last.digest?.lastRunDay !== day) due.push("digest");
  return due;
}

const RUNNERS: Record<Due, (at: Date) => unknown> = {
  engine: () => runEngineJobs(),
  watches: (at) => runWatchJob(at),
  digest: (at) => runDigestJob(at),
};

/** One scheduler pass; safe to call by hand. */
export async function tick(now = Date.now()): Promise<Due[]> {
  const store = jobRuns();
  const last = Object.fromEntries(store.all().map((run) => [run.id, run]));
  const due = dueJobs(now, last);
  for (const job of due) {
    await RUNNERS[job](new Date(now));
    store.put({ id: job, lastRunAt: new Date(now).toISOString(), lastRunDay: bangkokOf(now).day });
  }
  return due;
}

/** Starts the in-process timer once per server process. */
export function startScheduler(): void {
  const scope = globalThis as SchedulerGlobal;
  if (scope[STARTED]) return;
  scope[STARTED] = setInterval(() => {
    tick().catch((error: unknown) => console.error("[cop] scheduler tick failed", error));
  }, TICK_MS);
}
