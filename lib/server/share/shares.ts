import { randomBytes } from "node:crypto";
import type { User } from "@/lib/contracts";
import { headingWithoutNumbers } from "@/lib/compose/composer";
import { forecastTitle, metricTitle } from "@/lib/cards/tool-answers";
import { TH } from "@/lib/i18n/th";
import type { ShareChannel, SharedCard } from "@/lib/share/card";
import { winyuTools } from "@/lib/server/agent/tools";
import { collection } from "@/lib/server/store/json-store";

export const SHARES_COLLECTION = "shares";

/** 12 characters from 62: about 71 bits, so a code cannot be guessed, and only the sender and the recipients may open it anyway. */
export const SHARE_CODE_LENGTH = 12;
const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const UNBIASED_BYTE_LIMIT = 248;
const UNSHAREABLE_TOOLS: ReadonlySet<string> = new Set(["recall_memory", "list_metrics"]);

/** Why one recipient got the share on another channel than the one picked. */
export type FallbackReason = "no-teams-conversation" | "send-failed";

/** How one recipient was reached: the channel the sender picked, the one that carried it, and why they differ. */
export type ShareDelivery = { userId: string; asked: ShareChannel; via: ShareChannel; fallback: FallbackReason | null };

/** A shared card: the short code it opens at, who sent it to whom, the reads behind it (never their results), and how often recipients opened it. */
export type Share = { id: string; at: string; senderId: string; title: string; question: string | null; note: string | null; card: SharedCard; deliveries: ShareDelivery[]; views: number; lastViewedAt: string | null };

export function shares() {
  return collection<Share>(SHARES_COLLECTION);
}

/** A fresh short code, uniform over the alphabet. */
export function shareCode(): string {
  let code = "";
  while (code.length < SHARE_CODE_LENGTH) {
    for (const byte of randomBytes(SHARE_CODE_LENGTH * 2)) {
      if (byte >= UNBIASED_BYTE_LIMIT || code.length === SHARE_CODE_LENGTH) continue;
      code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    }
  }
  return code;
}

/** Whether every read is a read tool someone may re-run under their own access, with an input its schema accepts; the problem otherwise. */
export function shareableProblem(card: SharedCard): string | null {
  const tools = winyuTools();
  for (const read of card.reads) {
    const tool = tools[read.tool];
    if (!tool || tool.capability.tier !== "read" || UNSHAREABLE_TOOLS.has(read.tool)) return `${read.tool} cannot be shared`;
    if (!tool.inputSchema().safeParse(read.input).success) return `${read.tool} input does not parse`;
  }
  return null;
}

function rootTitle(card: SharedCard): string | null {
  if (card.kind !== "composed") return null;
  const title = card.components[0]?.title;
  return typeof title === "string" ? headingWithoutNumbers(title) : null;
}

/** The card's name as the message shows it, from what was asked and never from what came back: the metric's name, the composed card's heading without numbers, or the tool's kind of card. */
export function shareTitle(card: SharedCard): string {
  const composed = rootTitle(card);
  if (composed) return composed;
  const [first] = card.reads;
  if (first.tool === "query_metric") return metricTitle(null, first.input);
  if (first.tool === "get_forecast") return forecastTitle(null, first.input);
  if (first.tool === "get_alerts") return TH.cards.alertsTitle;
  return TH.share.titles[first.tool] ?? TH.share.defaultTitle;
}

/** Only the sender and the people it was sent to may open a share. */
export function mayOpen(share: Share, user: Pick<User, "id">): boolean {
  return share.senderId === user.id || share.deliveries.some((delivery) => delivery.userId === user.id);
}

/** Counts one opening by a recipient; the sender looking at their own share is not a view. */
export function noteView(share: Share, viewerId: string, at: string): Share {
  if (viewerId === share.senderId) return share;
  return shares().put({ ...share, views: share.views + 1, lastViewedAt: at });
}

/** The shares one person sent, newest first. */
export function sharesSentBy(userId: string): Share[] {
  return shares()
    .where((share) => share.senderId === userId)
    .sort((left, right) => right.at.localeCompare(left.at));
}
