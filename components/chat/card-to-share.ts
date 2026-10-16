import { ASK_CONTRADICTS_CARD, cardRefOf, sharedComposedCard, sharedToolCard, shareTitle, type CardOnScreen, type ExchangeRead, type ScreenCards, type SharedCard } from "@/lib/share/card";
import type { Exchange, ReplyStep, ToolStep } from "./timeline";
import { cardPlanOf, composedCalls, drawsNoCard, wroteBlock, type CardPlan } from "./tool-view";

const SEND_TOOL = "send_card";

/** Which card a send names: the one card it means, none on screen, several it could mean, or a ref no card on screen has. */
export type CardChoice =
  | { kind: "card"; card: CardOnScreen }
  | { kind: "none" }
  | { kind: "unclear"; cards: CardOnScreen[] }
  | { kind: "unknown"; ref: string; cards: CardOnScreen[] };

function isToolStep(step: ReplyStep): step is ToolStep {
  return step.kind === "tool";
}

function drawsShareableCard(step: ToolStep, plan: CardPlan, cardTools: ReadonlySet<string>): boolean {
  if (!cardTools.has(step.name) || plan.hidden.has(step.toolCallId) || step.outcome.state !== "returned") return false;
  return !drawsNoCard(step.outcome.result);
}

function readsOf(steps: readonly ToolStep[], cardTools: ReadonlySet<string>): ExchangeRead[] {
  return steps.filter((step) => cardTools.has(step.name)).map((step) => ({ toolCallId: step.toolCallId, tool: step.name, args: step.args, returned: step.outcome.state === "returned" }));
}

function cardOfStep(step: ReplyStep, plan: CardPlan, reads: readonly ExchangeRead[], cardTools: ReadonlySet<string>): SharedCard | null {
  if (step.kind === "composed") return step.surface.done ? sharedComposedCard(reads, step.surface) : null;
  if (step.kind !== "tool" || !drawsShareableCard(step, plan, cardTools)) return null;
  return sharedToolCard(reads, step.toolCallId, plan.paired.get(step.toolCallId) ?? []);
}

function heroOf(step: ReplyStep): string | null {
  if (step.kind !== "tool" || step.outcome.state !== "returned") return null;
  const headline = (step.outcome.result as { headline?: { value?: unknown } } | null)?.headline;
  return typeof headline?.value === "string" ? headline.value : null;
}

/** The sendable cards one finished exchange left on screen, in the order drawn, by the same plan the chat draws by: a lookup, a profile, a refusal or an empty answer is never one. */
export function cardsOfExchange(exchange: Exchange, cardTools: ReadonlySet<string>): CardOnScreen[] {
  const toolSteps = exchange.steps.filter(isToolStep);
  const plan = cardPlanOf(toolSteps, composedCalls(exchange.steps, false), cardTools, wroteBlock(exchange.steps));
  const reads = readsOf(toolSteps, cardTools);
  const question = exchange.question?.kind === "typed" ? exchange.question.text : null;
  return exchange.steps.flatMap((step) => {
    const card = cardOfStep(step, plan, reads, cardTools);
    return card ? [{ ref: cardRefOf(card), exchangeId: exchange.id, target: { card, question }, title: shareTitle(card), hero: heroOf(step) }] : [];
  });
}

function latestOfEach(cards: readonly CardOnScreen[]): CardOnScreen[] {
  return cards.filter((card, index) => !cards.slice(index + 1).some((later) => later.ref === card.ref));
}

function heldBackForContradiction(exchange: Exchange): boolean {
  return exchange.steps.some((step) => {
    if (step.kind !== "tool" || step.name !== SEND_TOOL || step.outcome.state !== "returned") return false;
    return (step.outcome.result as { code?: unknown } | null)?.code === ASK_CONTRADICTS_CARD;
  });
}

/** For each exchange, the cards on screen when a send was asked there (those it drew and every earlier one, a card drawn twice listed once at its latest), and whether an earlier exchange held a send back because its words contradicted its card. */
export function screenCardsEach(exchanges: readonly Exchange[], cardTools: ReadonlySet<string>): ScreenCards[] {
  let drawn: CardOnScreen[] = [];
  let warned = false;
  return exchanges.map((exchange) => {
    drawn = latestOfEach([...drawn, ...cardsOfExchange(exchange, cardTools)]);
    const screen = { exchangeId: exchange.id, cards: drawn, warned };
    warned ||= heldBackForContradiction(exchange);
    return screen;
  });
}

/** The card a send asked in `screen.exchangeId` means: the card `ref` names; with no ref, the one card that exchange drew, else the one card on screen; none or several to choose from is not a choice. */
export function cardNamed(screen: ScreenCards, ref: string | undefined): CardChoice {
  const named = ref?.trim().toLowerCase();
  if (named) {
    const card = screen.cards.find((candidate) => candidate.ref === named);
    return card ? { kind: "card", card } : { kind: "unknown", ref: named, cards: screen.cards };
  }
  const own = screen.cards.filter((card) => card.exchangeId === screen.exchangeId);
  const pool = own.length > 0 ? own : screen.cards;
  if (pool.length === 0) return { kind: "none" };
  return pool.length === 1 ? { kind: "card", card: pool[0] } : { kind: "unclear", cards: pool };
}
