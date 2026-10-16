import { cardNamed, type CardChoice } from "@/components/chat/card-to-share";
import type { User } from "@/lib/contracts";
import { businessToday } from "@/lib/data/dates";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { findUser } from "@/lib/data/entities/users";
import { notReady } from "@/lib/harness/gateway";
import type { Unready } from "@/lib/harness/types";
import { TH } from "@/lib/i18n/th";
import { ASK_CONTRADICTS_CARD, sendCardInputSchema, type CardOnScreen, type SendCardInput, type ShareTarget } from "@/lib/share/card";
import { contradictionOf } from "@/lib/share/figures";
import { matterAsk, matterDeadline, sendIntent } from "@/lib/share/matter";
import { resolvedPeople, type RecipientMatch } from "@/lib/share/recipients";
import { cardFigures, goalLabel } from "@/lib/server/share/goal";
import { receiptsOf, recipientMatches, sharePath } from "@/lib/server/share/shares";
import { suggestedRecipient } from "@/lib/server/share/suggest";
import { matterTitle } from "@/lib/server/share/title";
import { currentAccess, currentTurn } from "@/lib/server/request-context";
import { defineTool } from "./define";
import { matterHolds } from "./verify";

const UNRESOLVED = "UNRESOLVED_RECIPIENT";
const NO_RECIPIENT = "NO_RECIPIENT";
const NO_CARD = "NO_CARD";
const CARD_UNCLEAR = "CARD_UNCLEAR";
const CARD_UNKNOWN = "CARD_UNKNOWN";
const NOT_SHAREABLE = "NOT_SHAREABLE";
const ASK_NUMBERS = "ASK_CARRIES_NUMBERS";
const NUMBER = /[0-9๐-๙]+/g;

const DESCRIPTION =
  "Send one card on screen to a colleague as a matter: it lands in their bell with the ask, they answer on the card, can pass it on, and it closes itself when its number reaches its goal. Use it for every 'ส่ง… ให้…', 'ฝาก… ดู', 'แชร์ให้', 'มอบหมาย'. `cardRef` = the ref of the card the user means, copied from the cards-on-screen list (the card they point at: first, above, by its name, or the card the request is about, e.g. the overdue card for a collection); leave it out only to send the one card this reply drew. A person, owner, profile or master-data lookup is never a card to send. `to` = each colleague as the user named them (\"พี่อนุชา\", \"ผู้จัดการขายภาคอีสาน\" → resolve_owner first) or a user id; leave it out to send to the card's owner. `ask` = what the user wants done, in their words, no number they did not type. `intent` fyi only when the user only wants them to look. Leave `urgency` out unless the user's words say when; the server reads ด่วน and deadlines (พรุ่งนี้, ภายในศุกร์นี้) itself. `card` only when a pressed button passes it; copy it unchanged. The user sees the filled send sheet and approves it first.";

type Chosen = { ok: true; target: ShareTarget; warned: boolean } | { ok: false; code: string; fix: string };

function channelDelivery() {
  return import("@/lib/server/share/deliver");
}

function askFromPerson(ask: string | undefined): boolean {
  const question = currentTurn().question ?? "";
  return (ask?.match(NUMBER) ?? []).every((number) => question.includes(number));
}

function unresolvedLine(match: RecipientMatch<User>): string | null {
  if (match.kind === "unknown") return TH.share.chat.unknown(match.asked);
  if (match.kind === "ambiguous") return TH.share.chat.ambiguous(match.asked, match.candidates.map((user) => TH.share.chat.candidate(user.nameTh, user.title)).join(", "));
  return null;
}

function unresolved(names: readonly string[], senderId: string): string | null {
  const matches = recipientMatches(names, senderId);
  return resolvedPeople(matches) ? null : matches.flatMap((match) => unresolvedLine(match) ?? []).join(" · ");
}

function cardsLine(cards: readonly CardOnScreen[]): string {
  return cards.map((card) => TH.share.chat.cardOnScreen(card.ref, card.title, card.hero)).join(" · ");
}

function notChosen(choice: Exclude<CardChoice, { kind: "card" }>): Chosen {
  if (choice.kind === "none") return { ok: false, code: NO_CARD, fix: TH.share.chat.noCard };
  if (choice.kind === "unclear") return { ok: false, code: CARD_UNCLEAR, fix: TH.share.chat.unclearCard(cardsLine(choice.cards)) };
  return { ok: false, code: CARD_UNKNOWN, fix: TH.share.chat.unknownCard(choice.ref, cardsLine(choice.cards)) };
}

/** The card this send carries: the one a pressed button passed, else the card on screen `cardRef` names (or the only one there is), validated against what the conversation drew. */
async function chosenCard(input: SendCardInput): Promise<Chosen> {
  if (input.card) return { ok: true, target: { card: { kind: "tool", reads: input.card.reads }, question: currentTurn().question }, warned: false };
  const screen = await currentTurn().screenCards?.();
  if (!screen) return notChosen({ kind: "none" });
  const choice = cardNamed(screen, input.cardRef);
  return choice.kind === "card" ? { ok: true, target: choice.card.target, warned: screen.warned } : notChosen(choice);
}

/** The contradiction that holds a send back: the ask claims what the card's numbers do not show, and the conversation has not held a send back for that yet (once the person has read the figure, they may send anyway and the sheet warns). */
async function heldBack(ask: string | undefined, chosen: Extract<Chosen, { ok: true }>): Promise<string | null> {
  const sender = findUser(currentAccess().userId);
  if (chosen.warned || !sender || !ask?.trim()) return null;
  const warning = contradictionOf(ask, await cardFigures(chosen.target.card, sender));
  return warning ? TH.share.chat.heldBack(warning) : null;
}

async function unready(input: unknown): Promise<Unready | null> {
  const parsed = sendCardInputSchema.safeParse(input);
  if (!parsed.success) return notReady(TH.harness.notReady);
  if (!askFromPerson(parsed.data.ask)) return notReady(TH.share.chat.noteNumbers, ASK_NUMBERS);
  const names = parsed.data.to ?? [];
  const problem = names.length > 0 ? unresolved(names, currentAccess().userId) : null;
  if (problem) return notReady(problem, UNRESOLVED);
  const chosen = await chosenCard(parsed.data);
  if (!chosen.ok) return notReady(chosen.fix, chosen.code);
  const contradiction = await heldBack(parsed.data.ask, chosen);
  return contradiction ? notReady(contradiction, ASK_CONTRADICTS_CARD) : null;
}

function recipientsOf(input: SendCardInput, target: ShareTarget, sender: User): User[] | null {
  if (input.to && input.to.length > 0) return resolvedPeople(recipientMatches(input.to, sender.id));
  const owner = suggestedRecipient(target.card, sender.id);
  return owner ? [owner.user] : null;
}

type Refused = { ok: false; code: string; error: string };

function refusal(code: string, error: string): Refused {
  return { ok: false, code, error };
}

export const sendCardTool = defineTool({
  name: "send_card",
  connector: "winyu",
  tier: "write",
  roles: "all",
  description: DESCRIPTION,
  input: sendCardInputSchema,
  ready: unready,
  redact: ["ask"],
  verify: matterHolds,
  execute: async (input: SendCardInput) => {
    const sender = findUser(currentAccess().userId);
    if (!sender) return refusal(UNRESOLVED, TH.share.chat.unknown(currentAccess().userId));
    if (!askFromPerson(input.ask)) return refusal(ASK_NUMBERS, TH.share.chat.noteNumbers);
    const chosen = await chosenCard(input);
    if (!chosen.ok) return refusal(chosen.code, chosen.fix);
    const target = chosen.target;
    const people = recipientsOf(input, target, sender);
    if (!people) return input.to?.length ? refusal(UNRESOLVED, unresolved(input.to, sender.id) ?? TH.share.chat.noRecipient) : refusal(NO_RECIPIENT, TH.share.chat.noRecipient);
    const title = await matterTitle(target.card);
    const intent = sendIntent(input.intent, people.length);
    const ask = matterAsk(input.ask ?? "", intent, title);
    const { urgency, due } = matterDeadline(input.urgency, currentTurn().question, intent, businessToday());
    const { createShare } = await channelDelivery();
    const recipients = people.map((user) => ({ userId: user.id, channel: "winyu" as const }));
    const outcome = await createShare(sender, { card: target.card, question: target.question, ask, intent, urgency, due, recipients, alertIds: input.card?.alertIds ?? [] });
    if (!outcome.ok) return refusal(NOT_SHAREABLE, outcome.error);
    const receipts = receiptsOf(outcome.share);
    const hidden = outcome.hidden.map((scope) => TH.share.recipientHidden[scope.hidden](scope.name, metricLabel(scope.metric)));
    const warning = contradictionOf(ask, await cardFigures(target.card, sender));
    return {
      ok: true as const,
      summary: `${TH.share.chat.sent(outcome.share.title, receipts.map((receipt) => receipt.name).join(", "))}${hidden.length > 0 ? TH.share.chat.hidden(hidden.join(" · ")) : ""}`,
      data: { code: outcome.share.id, path: sharePath(outcome.share.id), title: outcome.share.title, receipts, hidden, intent, urgency, due, ask, goal: outcome.share.goal ? goalLabel(outcome.share.goal) : null, warning },
    };
  },
});
