import type { User } from "@/lib/contracts";
import type { SendPreview, SharedCard } from "@/lib/share/card";
import { cardFigures, goalLabel, goalOf } from "./goal";
import { suggestionsFor } from "./suggest";
import { matterTitle } from "./title";

/** What a send shows before it leaves, worked out by code: the title the matter will carry, whom to put first (the card's owner, then the sender's line), what the card's numbers say for the sender, and the goal that would close the matter. */
export async function sendPreview(card: SharedCard, sender: User, alertIds: readonly string[] = []): Promise<SendPreview> {
  const goal = goalOf(card, alertIds);
  return { ...suggestionsFor(card, sender.id), title: await matterTitle(card), figures: await cardFigures(card, sender), goal: goal ? goalLabel(goal) : null };
}
