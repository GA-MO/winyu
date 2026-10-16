import { AsyncLocalStorage } from "node:async_hooks";
import type { AccessContext, MetricQuery } from "@/lib/contracts";
import type { ShareTarget } from "@/lib/share/card";

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

/** One line of a saved conversation: who spoke, what they said, and for a reply the metrics its tool calls read. */
export type SpokenTurn = { role: string; text: string; metrics?: string[] };

/** The person's answer to one approval card: the tool it was for, and whether they said yes. */
export type AnsweredApproval = { tool: string; approved: boolean };

/** The chat turn being served; `transcript` reads the thread's saved conversation and `cardOnScreen` the card the person last saw on it, both absent outside a chat run; `answered` holds the approval answers this run carries out or declines. */
export type TurnContext = { turnId: string | null; threadId: string | null; preloadPacketId: string | null; question: string | null; queries: MetricQuery[]; transcript?: () => Promise<SpokenTurn[]>; cardOnScreen?: () => Promise<ShareTarget | null>; answered?: readonly AnsweredApproval[] };

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

