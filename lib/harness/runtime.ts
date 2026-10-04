import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { Initiator } from "@/lib/contracts";
import { collection } from "@/lib/server/store/json-store";
import type { EventSource, HarnessEvent, HarnessEventBody } from "./events";
import { LIMITS } from "./limits";
import type { Goal } from "./types";
import { stateOf, type AgentState } from "./state";

export const RUNS_COLLECTION = "runs";

const MAX_KEPT_RUNS = 300;

/** One agent execution: a person's message in, a reply out; its events are the trace and fold into its state. */
export type Run = { id: string; userId: string; threadId: string | null; initiator: Initiator; startedAt: number; events: HarnessEvent[]; toolCalls: number; toolBudget: number; steps: number; corrections: Record<string, number> };

type RunOptions = { id?: string; toolBudget?: number; initiator?: Initiator };

const runs = new AsyncLocalStorage<Run>();

export function newRun(userId: string, threadId: string | null, { id = randomUUID(), toolBudget = LIMITS.maxToolCalls, initiator = "person" }: RunOptions = {}): Run {
  return { id, userId, threadId, initiator, startedAt: Date.now(), events: [], toolCalls: 0, toolBudget, steps: 0, corrections: {} };
}

export function runWithRun<T>(run: Run, fn: () => T): T {
  return runs.run(run, fn);
}

/** The run being served, or null for a tool called outside one (a background job, a script). */
export function currentRun(): Run | null {
  return runs.getStore() ?? null;
}

/** Appends one event to a run's trace and returns it. */
export function emitTo(run: Run, source: EventSource, body: HarnessEventBody): HarnessEvent {
  const event = { ...body, id: randomUUID(), runId: run.id, at: new Date().toISOString(), source } as HarnessEvent;
  run.events.push(event);
  return event;
}

/** Appends one event to the current run's trace; a no-op outside a run. */
export function emit(source: EventSource, body: HarnessEventBody): void {
  const run = currentRun();
  if (run) emitTo(run, source, body);
}

export function runState(run: Run): AgentState {
  return stateOf(run.id, run.events);
}

/** A finished run as the trace store keeps it: who, which thread, when, and every event in order. */
export type RunRecord = { id: string; userId: string; threadId: string | null; startedAt: string; endedAt: string; events: HarnessEvent[] };

export function runStore() {
  return collection<RunRecord>(RUNS_COLLECTION);
}

function pruneRuns(): void {
  const store = runStore();
  const kept = store.all();
  const excess = kept.length - MAX_KEPT_RUNS;
  if (excess <= 0) return;
  for (const record of [...kept].sort((left, right) => left.endedAt.localeCompare(right.endedAt)).slice(0, excess)) store.remove(record.id);
}

/** Keeps a finished run's trace, dropping the oldest beyond the last few hundred. */
export function saveRun(run: Run): RunRecord {
  const record = { id: run.id, userId: run.userId, threadId: run.threadId, startedAt: new Date(run.startedAt).toISOString(), endedAt: new Date().toISOString(), events: run.events };
  runStore().put(record);
  pruneRuns();
  return record;
}

/** Runs agent work that no chat request started (a background job) as a traced run of its own: started with its goal, completed or failed, saved. */
export async function tracedRun<T>(userId: string, goal: Pick<Goal, "userMessage" | "intent">, toolBudget: number, work: () => Promise<T>): Promise<T> {
  const run = newRun(userId, null, { toolBudget, initiator: "job" });
  emitTo(run, "runtime", { type: "agent.started", payload: { goal: { id: run.id, ...goal, status: "active" }, userId, threadId: null } });
  try {
    const result = await runWithRun(run, work);
    emitTo(run, "runtime", { type: "agent.completed", payload: { finishReason: "done" } });
    return result;
  } catch (error) {
    emitTo(run, "runtime", { type: "agent.failed", payload: { reason: error instanceof Error ? error.message : String(error) } });
    throw error;
  } finally {
    saveRun(run);
  }
}
