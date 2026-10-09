import type { NotificationKind } from "@/lib/contracts";
import { shortName } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { notificationTarget } from "@/lib/share/notification-kinds";

export type Person = { name: string; photo: string | null };

/** One notification as every direction draws it: who caused it (none for Winyu's own watch), its title, when, and where it opens. */
export type NotifyItem = { id: string; kind: NotificationKind; title: string; person: Person | null; at: string; read: boolean; target: string };

export type Bucket = "decide" | "update";

/** The three moments every direction is drawn in. */
export type Moments = { one: NotifyItem[]; mix: NotifyItem[] };

/** One phrase of the digest sentence: what it says, who it is about, and where tapping it goes. */
export type DigestPart = { key: string; text: string; person: Person | null; target: string; bucket: Bucket };

const COPY = TH.notifyUi;

/** Which kinds wait on the reader (Inbox, bell count) and which only tell them something (Shared). */
export const BUCKET_OF: Record<NotificationKind, Bucket> = {
  handoff: "decide",
  grant_request: "decide",
  share: "update",
  grant_approved: "update",
  grant_declined: "update",
  alert: "update",
  reply: "update",
  email: "update",
};

export function bucketOf(item: NotifyItem): Bucket {
  return BUCKET_OF[item.kind];
}

/** The bell counts what waits on a decision, read or not; reading a request does not answer it. */
export function bellCount(items: readonly NotifyItem[]): number {
  return items.filter((item) => bucketOf(item) === "decide").length;
}

export function hasUnreadUpdate(items: readonly NotifyItem[]): boolean {
  return items.some((item) => bucketOf(item) === "update" && !item.read);
}

export function targetOf(kind: NotificationKind, refId: string): string {
  return notificationTarget({ kind, refId });
}

function phraseOf(group: NotifyItem[]): string {
  const [first] = group;
  if (!first) return "";
  const name = first.person ? shortName(first.person.name) : "";
  const digest = COPY.digest;
  switch (first.kind) {
    case "share":
      return digest.share(name, group.length);
    case "alert":
      return digest.alert(group.length);
    default:
      return digest[first.kind](name);
  }
}

/** The digest line: every open decision first, then unread updates, one phrase per person and kind. */
export function digestOf(items: readonly NotifyItem[]): DigestPart[] {
  const shown = items.filter((item) => bucketOf(item) === "decide" || !item.read);
  const groups = new Map<string, NotifyItem[]>();
  for (const item of shown) {
    const key = `${item.kind}:${item.kind === "alert" ? "" : (item.person?.name ?? "")}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const parts = [...groups.entries()].flatMap(([key, group]) => {
    const [first] = group;
    return first ? [{ key, text: phraseOf(group), person: first.person, target: first.target, bucket: BUCKET_OF[first.kind] }] : [];
  });
  return [...parts.filter((part) => part.bucket === "decide"), ...parts.filter((part) => part.bucket === "update")];
}

/** The digest cut to its first `limit` phrases, with how many phrases it leaves for "และอีก N เรื่อง". */
export function cappedDigest(parts: readonly DigestPart[], limit: number): { shown: DigestPart[]; more: number } {
  return { shown: parts.slice(0, limit), more: Math.max(0, parts.length - limit) };
}
