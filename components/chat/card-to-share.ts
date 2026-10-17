import { ASK_CONTRADICTS_CARD, CARD_MISSES_SUBJECT, cardRefOf, sharedComposedCard, sharedToolCard, shareTitle, type CardOnScreen, type ExchangeRead, type ScreenCards, type SharedCard } from "@/lib/share/card";
import type { Exchange, ReplyStep, ToolStep } from "./timeline";
import { alertHeroOf, leadingAlertOf, presentCard, presentGap } from "@/lib/cards/present";
import { gapResult } from "@/components/cards/entity/shapes";
import { alertsOf, metricAnswerOf, metricTitle, othersOf } from "@/lib/cards/tool-answers";
import { cardPlanOf, composedCalls, drawsNoCard, isRefused, pairedResultsOf, wroteBlock, type CardPlan } from "./tool-view";

const SEND_TOOL = "send_card";
const GAP_TOOL = "explain_gap";
const ALERTS_TOOL = "get_alerts";
const SAID_KEPT = 2;

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
  return !drawsNoCard(step.outcome.result) && !isRefused(step.outcome.result);
}

function readsOf(steps: readonly ToolStep[], cardTools: ReadonlySet<string>): ExchangeRead[] {
  return steps.filter((step) => cardTools.has(step.name)).map((step) => ({ toolCallId: step.toolCallId, tool: step.name, args: step.args, returned: step.outcome.state === "returned" }));
}

function cardOfStep(step: ReplyStep, plan: CardPlan, reads: readonly ExchangeRead[], cardTools: ReadonlySet<string>): SharedCard | null {
  if (step.kind === "composed") return step.surface.done ? sharedComposedCard(reads, step.surface) : null;
  if (step.kind !== "tool" || !drawsShareableCard(step, plan, cardTools)) return null;
  return sharedToolCard(reads, step.toolCallId, plan.paired.get(step.toolCallId) ?? []);
}

/** A why card's figure as its hero shows it: where the month ends, the share of target, or the actual with its change ("248.1 ล้านบาท −9.3%"), so its send names a number (AI-267). */
function gapHeroOf(result: unknown): string | null {
  const parsed = gapResult.safeParse(result);
  const hero = parsed.success ? presentGap({ answer: parsed.data, metric: null, split: null }).hero : null;
  return hero ? [hero.value, hero.unit, hero.delta].filter(Boolean).join(" ") : null;
}

/** An anomaly card's figure: the alert it leads with, by place, metric and signed gap ("อีสานรุ่งโรจน์ ค้าส่ง · ปริมาณขายเข้า −89%"), so its send names what and how much (AI-297). */
function alertsHeroOf(result: unknown): string | null {
  const leading = leadingAlertOf(alertsOf(result));
  if (!leading) return null;
  const hero = alertHeroOf(leading);
  return `${hero.label} ${hero.value}`;
}

/** The figure a card leads with, as the drawn card shows it: a metric card's hero from the same card plan (none when the card draws none), a why card's hero, an anomaly card's leading alert, else the result's headline. */
function heroOf(step: ReplyStep, plan: CardPlan, toolSteps: readonly ToolStep[]): string | null {
  if (step.kind !== "tool" || step.outcome.state !== "returned") return null;
  if (step.name === GAP_TOOL) return gapHeroOf(step.outcome.result);
  if (step.name === ALERTS_TOOL) return alertsHeroOf(step.outcome.result);
  const answer = metricAnswerOf(step.outcome.result);
  if (answer) {
    const others = othersOf(pairedResultsOf(plan, toolSteps, step.toolCallId));
    const hero = presentCard({ title: metricTitle(answer, step.args), query: answer.query, result: answer, actions: answer.nextActions, others }).hero;
    return hero ? [hero.value, hero.unit].filter(Boolean).join(" ") : null;
  }
  const headline = (step.outcome.result as { headline?: { value?: unknown } } | null)?.headline;
  return typeof headline?.value === "string" ? headline.value : null;
}

/** The sendable cards one finished exchange left on screen, in the order drawn, by the same plan the chat draws by: a lookup, a profile, a refusal or an empty answer is never one. */
export function cardsOfExchange(exchange: Exchange, cardTools: ReadonlySet<string>): CardOnScreen[] {
  const toolSteps = exchange.steps.filter(isToolStep);
  const plan = cardPlanOf(toolSteps, composedCalls(exchange.steps, false), cardTools, wroteBlock(exchange.steps));
  const reads = readsOf(toolSteps, cardTools);
  const question = typedIn(exchange);
  return exchange.steps.flatMap((step) => {
    const card = cardOfStep(step, plan, reads, cardTools);
    return card ? [{ ref: cardRefOf(card), exchangeId: exchange.id, target: { card, question }, title: shareTitle(card), hero: heroOf(step, plan, toolSteps) }] : [];
  });
}

function latestOfEach(cards: readonly CardOnScreen[]): CardOnScreen[] {
  return cards.filter((card, index) => !cards.slice(index + 1).some((later) => later.ref === card.ref));
}

function heldBackWith(exchange: Exchange, code: string): boolean {
  return exchange.steps.some((step) => {
    if (step.kind !== "tool" || step.name !== SEND_TOOL || step.outcome.state !== "returned") return false;
    return (step.outcome.result as { code?: unknown } | null)?.code === code;
  });
}

function typedIn(exchange: Exchange): string | null {
  return exchange.question?.kind === "typed" ? exchange.question.text : null;
}

/** For each exchange, the cards on screen when a send was asked there (those it drew and every earlier one, a card drawn twice listed once at its latest), whether an earlier exchange held a send back because its words contradicted its card or pointed it at another card, and the person's last typed words. */
export function screenCardsEach(exchanges: readonly Exchange[], cardTools: ReadonlySet<string>): ScreenCards[] {
  let drawn: CardOnScreen[] = [];
  let warned = false;
  let redirected = false;
  let said: string[] = [];
  return exchanges.map((exchange) => {
    drawn = latestOfEach([...drawn, ...cardsOfExchange(exchange, cardTools)]);
    const typed = typedIn(exchange);
    said = typed ? [typed, ...said].slice(0, SAID_KEPT) : said;
    const screen = { exchangeId: exchange.id, cards: drawn, warned, said, redirected };
    warned ||= heldBackWith(exchange, ASK_CONTRADICTS_CARD);
    redirected ||= heldBackWith(exchange, CARD_MISSES_SUBJECT);
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
