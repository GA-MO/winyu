import { AsyncLocalStorage } from "node:async_hooks";
import type { AccessContext, MetricQuery } from "@/lib/contracts";

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

export type TurnContext = { threadId: string | null; preloadPacketId: string | null; queries: MetricQuery[] };

const EMPTY_TURN: TurnContext = { threadId: null, preloadPacketId: null, queries: [] };

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
