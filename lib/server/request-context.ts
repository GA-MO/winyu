import { AsyncLocalStorage } from "node:async_hooks";
import type { AccessContext, MetricQuery } from "@/lib/contracts";
import type { TurnResult } from "@/lib/compose/ground";

const NO_ACCESS = "currentAccess() called outside runWithAccess()";

const storage = new AsyncLocalStorage<AccessContext>();

export function runWithAccess<T>(access: AccessContext, fn: () => T): T {
  return storage.run(access, fn);
}

/** The access context of the request being served; tools read it here, never from their input. */
export function currentAccess(): AccessContext {
  const access = storage.getStore();
  if (!access) throw new Error(NO_ACCESS);
  return access;
}

/** The access context when one is set, for code that also runs outside a request (background jobs, scripts). */
export function accessOrNull(): AccessContext | null {
  return storage.getStore() ?? null;
}

/** One line of a saved conversation: who spoke and what they said. */
export type SpokenTurn = { role: string; text: string };

/** The chat turn being served; `transcript` reads the thread's saved conversation and is absent outside a chat run. */
export type TurnContext = { turnId: string | null; threadId: string | null; preloadPacketId: string | null; question: string | null; queries: MetricQuery[]; results?: TurnResult[]; transcript?: () => Promise<SpokenTurn[]> };

const EMPTY_TURN: TurnContext = { turnId: null, threadId: null, preloadPacketId: null, question: null, queries: [] };

const turns = new AsyncLocalStorage<TurnContext>();

export function runWithTurn<T>(turn: TurnContext, fn: () => T): T {
  return turns.run(turn, fn);
}

/** Which thread the current chat turn belongs to; tools that write back to a conversation read it here. */
export function currentTurn(): TurnContext {
  return turns.getStore() ?? EMPTY_TURN;
}

/** Remembers a query the turn ran so a handoff can carry it as evidence. */
export function recordQuery(query: MetricQuery): void {
  turns.getStore()?.queries.push(query);
}

/** Remembers a read tool's result so a card composed later in the turn can only show what a tool returned. */
export function recordResult(result: TurnResult): void {
  const turn = turns.getStore();
  if (!turn) return;
  turn.results ??= [];
  turn.results.push(result);
}

/** The read results this chat turn has so far, oldest first. */
export function turnResults(): readonly TurnResult[] {
  return turns.getStore()?.results ?? [];
}
