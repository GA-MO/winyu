import type { User } from "@/lib/contracts";
import type { SendPreview, SharedCard } from "@/lib/share/card";
import { cardFocus } from "./focus";
import { cardFigures, goalLabel, goalOf } from "./goal";
import { unusedTitle } from "./shares";
import { suggestionsFor } from "./suggest";
import { matterSubject, matterTitle } from "./title";

/** What a send shows before it leaves, worked out by code: the title the matter will carry (with the rows the sender's `words` single out, and a repeat number when another matter has it), whom to put first (the card's owner, then the sender's line), what the card's numbers say for the sender, the goal that would close the matter, the singled-out rows with their own figure and any claim they refute, and the card's own subject. */
export async function sendPreview(card: SharedCard, sender: User, alertIds: readonly string[] = [], words: readonly string[] = []): Promise<SendPreview> {
  const goal = goalOf(card, alertIds);
  const focus = await cardFocus(card, sender, words);
  return {
    ...suggestionsFor(card, sender.id),
    title: unusedTitle(await matterTitle(card, focus?.labels)),
    figures: await cardFigures(card, sender),
    goal: goal ? goalLabel(goal) : null,
    focus,
    subject: await matterSubject(card),
  };
}
