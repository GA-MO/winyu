import { COMPOSE_TOOL } from "@/lib/compose/catalog";
import { UNCOMPOSABLE_TOOLS } from "@/lib/compose/ground";
import type { ReplyStep, ToolStep } from "./timeline";

const DECLINED_TEXT = /not approved|declined|rejected|denied/i;
const ANSWER_LISTS = ["rows", "weeks"] as const;

/** How one tool call shows in a reply: its card, the decision it waits on or its receipt, a working line, a quiet note, or nothing. */
export type ToolView =
  | { kind: "card"; name: string; result: unknown; args: unknown }
  | { kind: "decision"; tool: string; input: unknown; approved: boolean | null }
  | { kind: "working" }
  | { kind: "not-run" }
  | { kind: "none" };

/** What the live chat knows about one call beyond the transcript: whether a reply is streaming, whether this call waits for the person, what they chose, and whether a composed card shows (or may yet show) its result. */
export type ToolLive = { running: boolean; asking: boolean; decided: boolean | undefined; composed: boolean };

/** A write tool's result that says the person declined it rather than that it ran. */
export function isDeclined(result: unknown): boolean {
  if (typeof result === "string") return DECLINED_TEXT.test(result);
  if (typeof result !== "object" || result === null) return false;
  return (result as { approved?: unknown }).approved === false;
}

function isDone(result: unknown): boolean {
  return typeof result === "object" && result !== null && (result as { ok?: unknown }).ok === true;
}

/** A successful read that found nothing (no rows, no forecast weeks): the reply says so in words, as the prompt asks, so no empty card is drawn. */
export function isEmptyAnswer(result: unknown): boolean {
  if (typeof result !== "object" || result === null || (result as { ok?: unknown }).ok !== true) return false;
  const lists = ANSWER_LISTS.map((key) => (result as Record<string, unknown>)[key]).filter(Array.isArray);
  return lists.length > 0 && lists.every((list) => list.length === 0);
}

function cardView(step: ToolStep, live: ToolLive): ToolView {
  if (live.composed) return { kind: "none" };
  if (step.outcome.state === "returned" && isEmptyAnswer(step.outcome.result)) return { kind: "none" };
  if (step.outcome.state === "returned") return { kind: "card", name: step.name, result: step.outcome.result, args: step.args };
  if (step.outcome.state === "pending" && live.running) return { kind: "working" };
  return { kind: "none" };
}

function writeView(step: ToolStep, live: ToolLive): ToolView {
  const decision = { kind: "decision" as const, tool: step.name, input: step.args };
  if (live.asking) return { ...decision, approved: live.decided ?? null };
  if (step.outcome.state === "returned") {
    if (isDeclined(step.outcome.result)) return { ...decision, approved: false };
    return isDone(step.outcome.result) ? { ...decision, approved: true } : { kind: "none" };
  }
  if (step.outcome.state === "failed") return { kind: "none" };
  return live.running ? { kind: "working" } : { kind: "not-run" };
}

/** Picks how a tool call is drawn: read tools with a card in `cardTools` draw their result; every other tool is a write the person decides on, then a receipt. */
export function toolViewOf(step: ToolStep, live: ToolLive, cardTools: ReadonlySet<string>): ToolView {
  return cardTools.has(step.name) ? cardView(step, live) : writeView(step, live);
}

function composedCard(step: ReplyStep): boolean {
  if (step.kind !== "tool" || step.name !== COMPOSE_TOOL || step.outcome.state !== "returned") return false;
  return (step.outcome.result as { ok?: unknown } | null)?.ok === true;
}

/** The read calls of one exchange whose fixed card is not drawn: once the model composed the answer's card, it is the answer and every composable result stays inside it; while the reply still streams, a card composed next may cover them, so none flashes up first. A refused composition leaves the fixed cards as the fallback. */
export function composedCalls(steps: readonly ReplyStep[], streaming: boolean): ReadonlySet<string> {
  if (!streaming && !steps.some(composedCard)) return new Set();
  return new Set(steps.flatMap((step) => (step.kind === "tool" && !UNCOMPOSABLE_TOOLS.includes(step.name) ? [step.toolCallId] : [])));
}
