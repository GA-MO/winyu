import type { User } from "@/lib/contracts";
import type { SendPreview, SharedCard } from "@/lib/share/card";
import { cardFocus } from "./focus";
import { cardFigures, goalLabel, goalOf } from "./goal";
import { suggestionsFor } from "./suggest";
import { matterSubject, matterTitle } from "./title";

/** What a send shows before it leaves, worked out by code: the title the matter will carry (with the rows the sender's `words` single out; a repeat number is added at send time only to the same send made again), whom to put first (the card's owner, then the sender's line), what the card's numbers say for the sender, the goal that would close the matter, the singled-out rows with their own figure and any claim they refute, and the card's own subject. */
export async function sendPreview(card: SharedCard, sender: User, alertIds: readonly string[] = [], words: readonly string[] = []): Promise<SendPreview> {
  const focus = await cardFocus(card, sender, words);
  const goal = await goalOf(card, alertIds, focus?.labels);
  return {
    ...suggestionsFor(card, sender.id),
    title: await matterTitle(card, focus?.labels),
    figures: await cardFigures(card, sender),
    goal: goal ? goalLabel(goal) : null,
    focus,
    subject: await matterSubject(card),
  };
}
