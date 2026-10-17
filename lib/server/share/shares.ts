import { randomBytes } from "node:crypto";
import type { User } from "@/lib/contracts";
import { cardRefOf, UNSHAREABLE_TOOLS, type SharedCard, type ShareReceipt } from "@/lib/share/card";
import { matterOf, seenBy, waitsOn, type Matter, type StoredMatter } from "@/lib/share/matter";
import { findUser, USERS } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { matchRecipients, type RecipientMatch } from "@/lib/share/recipients";
import { winyuTools } from "@/lib/server/agent/tools";
import { collection, type Collection } from "@/lib/server/store/json-store";

export const SHARES_COLLECTION = "shares";

/** 12 characters from 62: about 71 bits, so a code cannot be guessed, and only the sender and the recipients may open it anyway. */
export const SHARE_CODE_LENGTH = 12;
const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const UNBIASED_BYTE_LIMIT = 248;
const FIRST_REPEAT = 2;

/** Every matter, each read through `matterOf` so a share stored before matters loads as one. */
export function shares(): Collection<Matter> {
  const stored = collection<StoredMatter>(SHARES_COLLECTION);
  return {
    all: () => stored.all().map(matterOf),
    get: (id) => {
      const found = stored.get(id);
      return found ? matterOf(found) : null;
    },
    put: (matter) => matterOf(stored.put(matter)),
    remove: (id) => stored.remove(id),
    where: (predicate) => stored.all().map(matterOf).filter(predicate),
  };
}

/** A title no matter carries yet: the title itself, else the first "(ครั้งที่ n)" of it from 2 that is free, so the bell, the matter page and the audit tell two matters about one card apart. */
export function unusedTitle(title: string): string {
  const taken = new Set(shares().all().map((matter) => matter.title));
  if (!taken.has(title)) return title;
  let count = FIRST_REPEAT;
  while (taken.has(TH.share.repeatTitle(title, count))) count += 1;
  return TH.share.repeatTitle(title, count);
}

/** The open matters that wait on this person's answer. */
export function mattersWaitingOn(userId: string): Matter[] {
  return shares().where((matter) => waitsOn(matter, userId));
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

/** Only the sender and the people on its path may open a matter. */
export function mayOpen(share: Matter, user: Pick<User, "id">): boolean {
  return share.senderId === user.id || share.path.some((hop) => hop.userId === user.id);
}

/** What opening a matter's page finds: the matter, or why the page stays closed (no such code, or the viewer is neither its sender nor on its path). */
export type MatterOpening = { ok: true; matter: Matter } | { ok: false; reason: "missing" | "notYours" };

/** The gate of the matter page. */
export function openingOf(code: string, viewer: Pick<User, "id">): MatterOpening {
  const matter = shares().get(code);
  if (!matter) return { ok: false, reason: "missing" };
  return mayOpen(matter, viewer) ? { ok: true, matter } : { ok: false, reason: "notYours" };
}

/** The recipients who have opened a share, each once however often they came back. */
export function openersOf(share: Matter): string[] {
  return share.openedBy ?? [];
}

/** Notes a recipient opening the matter, and moves their hop from sent to seen; the sender looking at their own is not an opening, and a recipient counts once. */
export function noteView(share: Matter, viewerId: string, at: string): Matter {
  if (viewerId === share.senderId) return share;
  const openers = openersOf(share);
  return shares().put({ ...share, openedBy: openers.includes(viewerId) ? openers : [...openers, viewerId], path: seenBy(share.path, viewerId), lastViewedAt: at });
}

/** Where a share opens inside Winyu. */
export function sharePath(code: string): string {
  return `/s/${code}`;
}

/** One card a person sent, as their screens name it: its ref, the latest matter it went out as, and who got that one. */
export type SentCard = { ref: string; path: string; receipts: ShareReceipt[] };

/** The cards one person sent, newest matter first per card, keyed by the ref their screen drew the card under (stored at send time, else the stored card's own), so a card reads as sent wherever it is drawn again. */
export function sentCardsOf(senderId: string): SentCard[] {
  const latest = new Map<string, Matter>();
  for (const matter of shares().where((candidate) => candidate.senderId === senderId)) {
    const ref = matter.cardRef ?? cardRefOf(matter.card);
    const kept = latest.get(ref);
    if (!kept || matter.at > kept.at) latest.set(ref, matter);
  }
  return [...latest].map(([ref, matter]) => ({ ref, path: sharePath(matter.id), receipts: receiptsOf(matter) }));
}

/** Each delivery with the recipient's name, for the sheet and Shared. */
export function receiptsOf(share: Matter): ShareReceipt[] {
  return share.deliveries.map((delivery) => ({ ...delivery, name: findUser(delivery.userId)?.nameTh ?? delivery.userId }));
}
