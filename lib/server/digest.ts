import type { AccessContext, FeedItem, FeedTone, User } from "@/lib/contracts";
import { liveAccessFor } from "@/lib/access/enforce";
import { USERS } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { digests, type DigestSent } from "./agent/collections";
import { factsFor, narrateDigest, type DigestLine, type Narrator } from "./digest-narrator";
import { feedFor, onePerStory } from "./feed";
import { ports } from "./ports";
import { watchesOf } from "./watches";

const MAX_LINES = 5;
const SYSTEM_SENDER = "cop";

export type Digest = { lead: string | null; lines: string[]; count: number; keys: string[]; tones: Record<string, FeedTone> };

type Previous = Pick<DigestSent, "keys" | "tones" | "alertIds"> | null;

/** Worth a morning line: every matter on the feed except low-severity alerts, as on the landing. */
function isDigestWorthy(item: FeedItem): boolean {
  return item.source !== "alert" || item.tone !== "info";
}

/** New since the last digest, or turned red since it: a matter already told the same way is not told again. */
function isNews(item: FeedItem, previous: Previous): boolean {
  const known = new Set([...(previous?.keys ?? []), ...(previous?.alertIds ?? []).map((id) => `alert:${id}`)]);
  if (!known.has(item.key)) return true;
  return item.tone === "danger" && previous?.tones?.[item.key] !== "danger";
}

function lineOf(item: FeedItem): string {
  return item.detail ? `${item.label} · ${item.reason} (${item.detail})` : `${item.label} · ${item.reason}`;
}

function ordered(lines: readonly DigestLine[], order: readonly string[]): DigestLine[] {
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...lines].sort((left, right) => (rank.get(left.id) ?? order.length) - (rank.get(right.id) ?? order.length));
}

/**
 * What one user should hear this morning: the matters on their feed that are new or turned red since the last digest, and the watches over the line;
 * a narrator may write the opening sentence and the reading order, never the lines.
 */
export async function digestFor(access: AccessContext, previous: Previous, now = Date.now(), narrate: Narrator | null = null, who = ""): Promise<Digest> {
  const items = (await feedFor(access, now)).filter(isDigestWorthy);
  const fresh = onePerStory(items.filter((item) => isNews(item, previous)));
  const shown: DigestLine[] = fresh.slice(0, MAX_LINES).map((item, index) => ({ id: `d${index + 1}`, text: lineOf(item) }));
  const narration = narrate && shown.length > 0 ? await narrate(who, shown, factsFor(access.userId)) : null;
  const lines = ordered(shown, narration?.order ?? []).map((line) => line.text);
  if (fresh.length > MAX_LINES) lines.push(TH.digest.moreItems(fresh.length - MAX_LINES));
  const triggered = watchesOf(access.userId).filter((watch) => watch.state === "triggered");
  for (const watch of triggered) lines.push(TH.digest.watch(watch.title));
  return {
    lead: narration?.lead ?? null,
    lines,
    count: fresh.length + triggered.length,
    keys: items.map((item) => item.key),
    tones: Object.fromEntries(items.map((item) => [item.key, item.tone])),
  };
}

async function send(user: User, digest: Digest): Promise<void> {
  const body = [...(digest.lead ? [digest.lead, ""] : []), ...digest.lines.map((line) => `• ${line}`), "", TH.digest.footer];
  await ports().mail.send({
    kind: "digest",
    fromUserId: SYSTEM_SENDER,
    toUserId: user.id,
    toEmail: user.email,
    subject: TH.digest.subject(digest.count),
    body: body.join("\n"),
    refId: null,
  });
}

/** Once a day per user, and only to users who have something new to hear; what it told is not told again tomorrow unless it turned red. */
export async function runDigestJob(at = new Date(), narrate: Narrator | null = narrateDigest): Promise<{ sent: number; skipped: number }> {
  const day = at.toISOString().slice(0, 10);
  let sent = 0;
  let skipped = 0;
  for (const user of USERS) {
    const previous = digests().get(user.id);
    if (previous?.day === day) {
      skipped += 1;
      continue;
    }
    const digest = await digestFor(liveAccessFor(user), previous, at.getTime(), narrate, `${user.nameTh} (${TH.role[user.role]})`);
    if (digest.lines.length === 0) {
      skipped += 1;
      continue;
    }
    await send(user, digest);
    digests().put({ id: user.id, day, keys: digest.keys, tones: digest.tones });
    sent += 1;
  }
  return { sent, skipped };
}
