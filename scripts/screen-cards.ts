import { cardRefOf, shareTitle, type CardOnScreen, type ScreenCards, type ShareTarget } from "@/lib/share/card";

const EXCHANGE = "test-exchange";

/** A card as the cards-on-screen list carries it, drawn in `exchangeId` (by default an earlier exchange than the one a test sends from). */
export function onScreen(target: ShareTarget, exchangeId = "earlier-exchange", hero: string | null = null): CardOnScreen {
  return { ref: cardRefOf(target.card), exchangeId, target, title: shareTitle(target.card), hero };
}

/** The screen a send in a test sees: these cards drawn earlier, whether a send was already held back for a contradiction, and the person's last typed words, newest first. */
export function screenWith(targets: readonly (ShareTarget | CardOnScreen)[], warned = false, said: string[] = []): ScreenCards {
  const cards = targets.map((target) => ("ref" in target ? target : onScreen(target)));
  return { exchangeId: EXCHANGE, cards, warned, said, redirected: false };
}
