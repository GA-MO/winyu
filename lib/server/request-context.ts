import { AsyncLocalStorage } from "node:async_hooks";
import type { AccessContext, Dim, MetricQuery } from "@/lib/contracts";
import type { CardOnScreen, ScreenCards } from "@/lib/share/card";

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

/** A tool call the turn finished: its id, the tool, what it was asked and what came back. */
export type FinishedCall = { toolCallId: string; tool: string; args: unknown; output: unknown };

/** The chat turn being served; `transcript` reads the thread's saved conversation and `screenCards` the cards on screen when this question was asked (this run's finished calls included), both absent outside a chat run; `onScreen` lists the cards earlier questions left, for the model to name one; `subjects` are the entities the turn resolved by name; `finished` the calls this run finished so far; `answered` holds the approval answers this run carries out or declines. */
export type TurnContext = {
  turnId: string | null;
  threadId: string | null;
  question: string | null;
  queries: MetricQuery[];
  subjects?: TurnSubject[];
  transcript?: () => Promise<SpokenTurn[]>;
  screenCards?: () => Promise<ScreenCards>;
  onScreen?: readonly CardOnScreen[];
  finished?: FinishedCall[];
  answered?: readonly AnsweredApproval[];
};

const EMPTY_TURN: TurnContext = { turnId: null, threadId: null, question: null, queries: [] };

const turns = new AsyncLocalStorage<TurnContext>();

export function runWithTurn<T>(turn: TurnContext, fn: () => T): T {
  return turns.run(turn, fn);
}

/** Which thread the current chat turn belongs to; tools that write back to a conversation read it here. */
export function currentTurn(): TurnContext {
  return turns.getStore() ?? EMPTY_TURN;
}

/** One record the turn resolved by name (an agent, a DC, a SKU): what the person is asking about. */
export type TurnSubject = { dim: Dim; id: string };

/** Remembers a record the turn resolved, so a later read the model left unnarrowed (the alerts) can keep to it. */
export function recordSubject(subject: TurnSubject): void {
  const turn = turns.getStore();
  if (turn) turn.subjects = [...(turn.subjects ?? []), subject];
}

/** Remembers a call this run finished, so a later call of the same run (a send) sees the card it drew before memory holds it. */
export function recordFinished(call: FinishedCall): void {
  const turn = turns.getStore();
  if (turn) turn.finished = [...(turn.finished ?? []), call];
}

/** The records the turn resolved so far, in order. */
export function turnSubjects(): readonly TurnSubject[] {
  return turns.getStore()?.subjects ?? [];
}

/** Remembers a query the turn ran so a handoff can carry it as evidence. */
export function recordQuery(query: MetricQuery): void {
  turns.getStore()?.queries.push(query);
}

