import { jobRuns } from "./agent/collections";
import { runEngineJobs } from "./alerts";
import { runDigestJob } from "./digest";
import { runInvestigateJob } from "./investigate";
import { runWatchJob } from "./watches";
import { probeConnectors } from "./connectors/reconcile";

const TICK_MS = 5 * 60_000;
const HOUR_MS = 60 * 60_000;
const BANGKOK_OFFSET_MS = 7 * HOUR_MS;
const DIGEST_HOUR = 7;
const INVESTIGATE_HOUR = 6;
const STARTED = Symbol.for("winyu.scheduler.started");

type Due = "engine" | "watches" | "digest" | "investigate";

type SchedulerGlobal = typeof globalThis & { [STARTED]?: ReturnType<typeof setInterval> };

function bangkokOf(now: number): { day: string; hour: number } {
  const local = new Date(now + BANGKOK_OFFSET_MS);
  return { day: local.toISOString().slice(0, 10), hour: local.getUTCHours() };
}

/** Which jobs are due at this moment: the engine once a local day, watches every hour, the digest once a day from 07:00, and, when switched on, the morning investigation once a day from 06:00. */
export function dueJobs(now: number, last: Partial<Record<Due, { lastRunAt: string; lastRunDay: string }>>, investigating = false): Due[] {
  const { day, hour } = bangkokOf(now);
  const due: Due[] = [];
  if (last.engine?.lastRunDay !== day) due.push("engine");
  if (!last.watches || now - Date.parse(last.watches.lastRunAt) >= HOUR_MS) due.push("watches");
  if (hour >= DIGEST_HOUR && last.digest?.lastRunDay !== day) due.push("digest");
  if (investigating && hour >= INVESTIGATE_HOUR && last.investigate?.lastRunDay !== day) due.push("investigate");
  return due;
}

const RUNNERS: Record<Due, (at: Date) => unknown> = {
  engine: () => runEngineJobs(),
  watches: (at) => runWatchJob(at),
  digest: (at) => runDigestJob(at),
  investigate: () => runInvestigateJob(),
};

/** One scheduler pass; safe to call by hand. */
export async function tick(now = Date.now()): Promise<Due[]> {
  const store = jobRuns();
  const last = Object.fromEntries(store.all().map((run) => [run.id, run]));
  const due = dueJobs(now, last, process.env.INVESTIGATE_DAILY === "1");
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
    tick().catch((error: unknown) => console.error("[mascop] scheduler tick failed", error));
    probeConnectors().catch((error: unknown) => console.error("[mascop] connector probe failed", error));
  }, TICK_MS);
}
