import type { User } from "@/lib/contracts";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { findUser } from "@/lib/data/entities/users";
import { notReady } from "@/lib/harness/gateway";
import type { Unready } from "@/lib/harness/types";
import { TH } from "@/lib/i18n/th";
import { sendCardInputSchema, shareTitle, type SendCardInput, type ShareTarget } from "@/lib/share/card";
import { contradictionOf } from "@/lib/share/figures";
import { matterUrgency, sendIntent } from "@/lib/share/matter";
import { resolvedPeople, type RecipientMatch } from "@/lib/share/recipients";
import { cardFigures, goalLabel } from "@/lib/server/share/goal";
import { receiptsOf, recipientMatches, sharePath } from "@/lib/server/share/shares";
import { suggestedRecipient } from "@/lib/server/share/suggest";
import { currentAccess, currentTurn } from "@/lib/server/request-context";
import { defineTool } from "./define";
import { matterHolds } from "./verify";

const UNRESOLVED = "UNRESOLVED_RECIPIENT";
const NO_RECIPIENT = "NO_RECIPIENT";
const NO_CARD = "NO_CARD";
const NOT_SHAREABLE = "NOT_SHAREABLE";
const ASK_NUMBERS = "ASK_CARRIES_NUMBERS";
const NUMBER = /[0-9๐-๙]+/g;

const DESCRIPTION =
  "Send the card this exchange answered with (or, when this exchange drew none, the newest card of the conversation) to a colleague as a matter: it lands in their bell with the ask, they answer on the card, can pass it on, and it closes itself when its number reaches its goal. Use it for every 'ส่ง… ให้…', 'ฝาก… ดู', 'แชร์ให้', 'มอบหมาย'. `to` = each colleague as the user named them (\"พี่อนุชา\", \"ผู้จัดการขายภาคอีสาน\" → resolve_owner first) or a user id; leave it out to send to the card's owner. `ask` = what the user wants done, in their words, no number they did not type. `intent` fyi only when the user only wants them to look. Leave `urgency` out unless the user's words say when; the server reads ด่วน itself. `card` only when a pressed button passes it; copy it unchanged. The user sees the filled send sheet and approves it first.";

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

function unready(input: unknown): Unready | null {
  const parsed = sendCardInputSchema.safeParse(input);
  if (!parsed.success) return notReady(TH.harness.notReady);
  if (!askFromPerson(parsed.data.ask)) return notReady(TH.share.chat.noteNumbers, ASK_NUMBERS);
  const names = parsed.data.to ?? [];
  const problem = names.length > 0 ? unresolved(names, currentAccess().userId) : null;
  return problem ? notReady(problem, UNRESOLVED) : null;
}

async function cardToSend(input: SendCardInput): Promise<ShareTarget | null> {
  if (input.card) return { card: { kind: "tool", reads: input.card.reads }, question: currentTurn().question };
  return (await currentTurn().cardToSend?.()) ?? null;
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
    const target = await cardToSend(input);
    if (!target) return refusal(NO_CARD, TH.share.chat.noCard);
    const people = recipientsOf(input, target, sender);
    if (!people) return input.to?.length ? refusal(UNRESOLVED, unresolved(input.to, sender.id) ?? TH.share.chat.noRecipient) : refusal(NO_RECIPIENT, TH.share.chat.noRecipient);
    const title = shareTitle(target.card);
    const intent = sendIntent(input.intent, people.length);
    const ask = (input.ask ?? "").trim() || (intent === "act" ? TH.share.askDraft(title) : "");
    const urgency = matterUrgency(input.urgency, currentTurn().question, intent);
    const { createShare } = await channelDelivery();
    const recipients = people.map((user) => ({ userId: user.id, channel: "winyu" as const }));
    const outcome = await createShare(sender, { card: target.card, question: target.question, ask, intent, urgency, recipients, alertIds: input.card?.alertIds ?? [] });
    if (!outcome.ok) return refusal(NOT_SHAREABLE, outcome.error);
    const receipts = receiptsOf(outcome.share);
    const hidden = outcome.hidden.map((scope) => TH.share.recipientHidden[scope.hidden](scope.name, metricLabel(scope.metric)));
    const warning = contradictionOf(ask, await cardFigures(target.card, sender));
    return {
      ok: true as const,
      summary: `${TH.share.chat.sent(outcome.share.title, receipts.map((receipt) => receipt.name).join(", "))}${hidden.length > 0 ? TH.share.chat.hidden(hidden.join(" · ")) : ""}`,
      data: { code: outcome.share.id, path: sharePath(outcome.share.id), title: outcome.share.title, receipts, hidden, intent, urgency, ask, goal: outcome.share.goal ? goalLabel(outcome.share.goal) : null, warning },
    };
  },
});
