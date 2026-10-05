import type { User } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { channelFor, shareCardInputSchema, type ShareCardInput } from "@/lib/share/card";
import { resolvedPeople, type RecipientMatch } from "@/lib/share/recipients";
import { receiptsOf, recipientMatches, sharePath } from "@/lib/server/share/shares";
import { currentAccess, currentTurn } from "@/lib/server/request-context";
import { defineTool } from "./define";
import { shareHolds } from "./verify";

const UNRESOLVED = "UNRESOLVED_RECIPIENT";
const NO_CARD = "NO_CARD";
const NOT_SHAREABLE = "NOT_SHAREABLE";

function channelDelivery() {
  return import("@/lib/server/share/deliver");
}

function isReady(input: unknown): boolean {
  const parsed = shareCardInputSchema.safeParse(input);
  return parsed.success && resolvedPeople(recipientMatches(parsed.data.to, currentAccess().userId)) !== null;
}

function unresolvedLine(match: RecipientMatch<User>): string | null {
  if (match.kind === "unknown") return TH.share.chat.unknown(match.asked);
  if (match.kind === "ambiguous") return TH.share.chat.ambiguous(match.asked, match.candidates.map((user) => TH.share.chat.candidate(user.nameTh, user.title, user.id)).join(", "));
  return null;
}

export const shareCardTool = defineTool({
  name: "share_card",
  connector: "winyu",
  tier: "write",
  roles: "all",
  description: "Share the newest card of this conversation with colleagues for their information: they get its title, the note and a link into Winyu, and see the numbers under their own access. `to` = each colleague as the user named them (\"คุณกฤต\") or a user id, no lookup first. `channel` only when the user names one. The user approves it first.",
  input: shareCardInputSchema,
  ready: isReady,
  redact: ["note"],
  verify: shareHolds,
  execute: async (input: ShareCardInput) => {
    const sender = findUser(currentAccess().userId);
    if (!sender) return { ok: false as const, code: UNRESOLVED, error: TH.share.chat.unknown(currentAccess().userId) };
    const matches = recipientMatches(input.to, sender.id);
    const people = resolvedPeople(matches);
    if (!people) return { ok: false as const, code: UNRESOLVED, error: matches.flatMap((match) => unresolvedLine(match) ?? []).join(" · ") };
    const onScreen = (await currentTurn().cardOnScreen?.()) ?? null;
    if (!onScreen) return { ok: false as const, code: NO_CARD, error: TH.share.chat.noCard };
    const { channelsFor, createShare } = await channelDelivery();
    const recipients = people.map((user) => ({ userId: user.id, channel: channelFor(channelsFor(user.id), input.channel ?? null) }));
    const outcome = await createShare(sender, { card: onScreen.card, question: onScreen.question, note: input.note ?? "", recipients });
    if (!outcome.ok) return { ok: false as const, code: NOT_SHAREABLE, error: outcome.error };
    const receipts = receiptsOf(outcome.share);
    return {
      ok: true as const,
      summary: TH.share.chat.sent(outcome.share.title, receipts.map((receipt) => receipt.name).join(", ")),
      data: { code: outcome.share.id, path: sharePath(outcome.share.id), title: outcome.share.title, receipts },
    };
  },
});
