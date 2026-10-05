import { sharedComposedCard, sharedToolCard, UNSHAREABLE_TOOLS, type ExchangeRead, type SharedCard, type ShareTarget } from "@/lib/share/card";
import type { Exchange, ReplyStep, ToolStep } from "./timeline";
import { cardPlanOf, composedCalls, isEmptyAnswer, type CardPlan } from "./tool-view";

function isToolStep(step: ReplyStep): step is ToolStep {
  return step.kind === "tool";
}

function isRefusal(result: unknown): boolean {
  return typeof result === "object" && result !== null && (result as { ok?: unknown }).ok === false;
}

function drawsShareableCard(step: ToolStep, plan: CardPlan, cardTools: ReadonlySet<string>): boolean {
  if (!cardTools.has(step.name) || UNSHAREABLE_TOOLS.has(step.name) || plan.hidden.has(step.toolCallId) || step.outcome.state !== "returned") return false;
  const result = plan.results.has(step.toolCallId) ? plan.results.get(step.toolCallId) : step.outcome.result;
  return !isEmptyAnswer(result) && !isRefusal(result);
}

function readsOf(steps: readonly ToolStep[], cardTools: ReadonlySet<string>): ExchangeRead[] {
  return steps.filter((step) => cardTools.has(step.name)).map((step) => ({ toolCallId: step.toolCallId, tool: step.name, args: step.args, returned: step.outcome.state === "returned" }));
}

function cardOfStep(step: ReplyStep, plan: CardPlan, reads: readonly ExchangeRead[], cardTools: ReadonlySet<string>): SharedCard | null {
  if (step.kind === "composed") return step.surface.done ? sharedComposedCard(reads, step.surface) : null;
  if (step.kind !== "tool" || !drawsShareableCard(step, plan, cardTools)) return null;
  return sharedToolCard(reads, step.toolCallId);
}

/** The card a finished exchange leaves on screen last, as a share stores it: a composed card that holds, or the last fixed card the chat drew (the same plan the chat draws by, so a recipient lookup, a corrected refusal or an empty answer is never it). */
export function lastCardOf(exchange: Exchange, cardTools: ReadonlySet<string>): ShareTarget | null {
  const toolSteps = exchange.steps.filter(isToolStep);
  const plan = cardPlanOf(toolSteps, composedCalls(exchange.steps, false), cardTools);
  const reads = readsOf(toolSteps, cardTools);
  const question = exchange.question?.kind === "typed" ? exchange.question.text : null;
  for (const step of [...exchange.steps].reverse()) {
    const card = cardOfStep(step, plan, reads, cardTools);
    if (card) return { card, question };
  }
  return null;
}

/** The newest card these exchanges drew, or null when none did. */
export function newestCardOf(exchanges: readonly Exchange[], cardTools: ReadonlySet<string>): ShareTarget | null {
  for (const exchange of [...exchanges].reverse()) {
    const card = lastCardOf(exchange, cardTools);
    if (card) return card;
  }
  return null;
}

/** For each exchange, what "ส่งการ์ดนี้" asked there points at: the newest card an earlier exchange drew, or null when none did. */
export function cardsBeforeEach(exchanges: readonly Exchange[], cardTools: ReadonlySet<string>): (ShareTarget | null)[] {
  let newest: ShareTarget | null = null;
  return exchanges.map((exchange) => {
    const before = newest;
    newest = lastCardOf(exchange, cardTools) ?? newest;
    return before;
  });
}
