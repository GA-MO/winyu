import { randomBytes } from "node:crypto";
import type { User } from "@/lib/contracts";
import { UNSHAREABLE_TOOLS, type FallbackReason, type SentShare, type ShareChannel, type SharedCard, type ShareReceipt } from "@/lib/share/card";
import { findUser, USERS } from "@/lib/data/entities/users";
import { matchRecipients, type RecipientMatch } from "@/lib/share/recipients";
import { winyuTools } from "@/lib/server/agent/tools";
import { collection } from "@/lib/server/store/json-store";

export const SHARES_COLLECTION = "shares";

/** 12 characters from 62: about 71 bits, so a code cannot be guessed, and only the sender and the recipients may open it anyway. */
export const SHARE_CODE_LENGTH = 12;
const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const UNBIASED_BYTE_LIMIT = 248;

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

/** How each typed name resolves among everyone the sender can share with; a name that fits several people stays unresolved. */
export function recipientMatches(names: readonly string[], senderId: string): RecipientMatch<User>[] {
  return matchRecipients(names, USERS.filter((user) => user.id !== senderId));
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

/** Where a share opens inside Winyu. */
export function sharePath(code: string): string {
  return `/s/${code}`;
}

/** Each delivery with the recipient's name, for the sheet and the account sheet. */
export function receiptsOf(share: Share): ShareReceipt[] {
  return share.deliveries.map((delivery) => ({ ...delivery, name: findUser(delivery.userId)?.nameTh ?? delivery.userId }));
}

/** The shares one person sent, newest first. */
export function sharesSentBy(userId: string): SentShare[] {
  return shares()
    .where((share) => share.senderId === userId)
    .sort((left, right) => right.at.localeCompare(left.at))
    .map((share) => ({ code: share.id, path: sharePath(share.id), title: share.title, at: share.at, receipts: receiptsOf(share), views: share.views }));
}
