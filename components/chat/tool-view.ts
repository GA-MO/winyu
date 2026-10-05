import { UNCOMPOSABLE_TOOLS } from "@/lib/compose/ground";
import type { ReplyStep, ToolStep } from "./timeline";

const DECLINED_TEXT = /not approved|declined|rejected|denied/i;
const ANSWER_LISTS = ["rows", "weeks"] as const;
const DOCUMENTS_TOOL = "search_documents";
const CATALOG_TOOL = "list_metrics";

/** How one tool call shows in a reply: its card, the decision it waits on or its receipt, a working line, a quiet note, or nothing. */
export type ToolView =
  | { kind: "card"; name: string; result: unknown; args: unknown }
  | { kind: "decision"; tool: string; input: unknown; approved: boolean | null }
  | { kind: "working" }
  | { kind: "not-run" }
  | { kind: "none" };

/** What the live chat knows about one call beyond the transcript: whether a reply is streaming, whether this call waits for the person, what they chose, and whether its card is left out (a composed card shows or may yet show its result, or another card of the exchange draws it). */
export type ToolLive = { running: boolean; asking: boolean; decided: boolean | undefined; hidden: boolean };

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
  if (live.hidden) return { kind: "none" };
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

function holdsCard(step: ReplyStep): boolean {
  return step.kind === "composed" && step.surface.components.length > 0;
}

/** The read calls of one exchange whose fixed card is not drawn: once a composed card holds, it is the answer and every composable result stays inside it; while the reply still streams, a card block may yet come, so none flashes up first. A block where nothing held leaves the fixed cards as the fallback. */
export function composedCalls(steps: readonly ReplyStep[], streaming: boolean): ReadonlySet<string> {
  if (!streaming && !steps.some(holdsCard)) return new Set();
  return new Set(steps.flatMap((step) => (step.kind === "tool" && !UNCOMPOSABLE_TOOLS.includes(step.name) ? [step.toolCallId] : [])));
}

/** How the fixed cards of one exchange are drawn: the calls whose card is left out, and the results a card draws in place of its own call's. */
export type CardPlan = { hidden: ReadonlySet<string>; results: ReadonlyMap<string, unknown> };

type Passage = { doc_id?: unknown; section?: unknown; text?: unknown };
type DocumentsResult = { data: { passages: Passage[] } };

function documentsOf(step: ToolStep): DocumentsResult | null {
  if (step.name !== DOCUMENTS_TOOL || step.outcome.state !== "returned") return null;
  const result = step.outcome.result as { data?: { passages?: unknown } } | null;
  return typeof result === "object" && result !== null && Array.isArray(result.data?.passages) ? (result as DocumentsResult) : null;
}

function passageKey(passage: Passage): string {
  return JSON.stringify([passage.doc_id, passage.section, passage.text]);
}

function mergedDocuments(results: readonly DocumentsResult[]): DocumentsResult {
  const passages = new Map<string, Passage>();
  for (const passage of results.flatMap((result) => result.data.passages)) if (!passages.has(passageKey(passage))) passages.set(passageKey(passage), passage);
  const last = results[results.length - 1];
  return { ...last, data: { ...last.data, passages: [...passages.values()] } };
}

function answered(step: ToolStep): boolean {
  if (step.outcome.state !== "returned") return false;
  const result = step.outcome.result;
  return typeof result !== "object" || result === null || (result as { ok?: unknown }).ok !== false;
}

function recoveredFailures(steps: readonly ToolStep[]): string[] {
  return steps.flatMap((step, index) => {
    if (answered(step) || step.outcome.state === "pending") return [];
    return steps.slice(index + 1).some((later) => later.name === step.name && answered(later)) ? [step.toolCallId] : [];
  });
}

function drawsAnswer(step: ToolStep, hidden: ReadonlySet<string>, cardTools: ReadonlySet<string>): boolean {
  if (step.name === CATALOG_TOOL || !cardTools.has(step.name) || hidden.has(step.toolCallId)) return false;
  return step.outcome.state === "returned" && !isEmptyAnswer(step.outcome.result);
}

/** One card per question: a refused or failed call the model corrected later in the exchange (the same tool answered after it) is left out, every documents search of the exchange draws as one card at the first search (passages merged, duplicates dropped, so citations count over all of them), and the metric catalog the model browsed on the way is left out once another card answers; `composed` are the calls a composed card already holds. */
export function cardPlanOf(steps: readonly ToolStep[], composed: ReadonlySet<string>, cardTools: ReadonlySet<string>): CardPlan {
  const hidden = new Set([...composed, ...recoveredFailures(steps)]);
  const results = new Map<string, unknown>();
  const searches = steps.flatMap((step) => {
    const documents = documentsOf(step);
    return documents ? [{ step, documents }] : [];
  });
  if (searches.length > 1) {
    results.set(searches[0].step.toolCallId, mergedDocuments(searches.map((search) => search.documents)));
    for (const search of searches.slice(1)) hidden.add(search.step.toolCallId);
  }
  if (!steps.some((step) => drawsAnswer(step, hidden, cardTools))) return { hidden, results };
  for (const step of steps) if (step.name === CATALOG_TOOL) hidden.add(step.toolCallId);
  return { hidden, results };
}
