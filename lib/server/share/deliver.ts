import type { User } from "@/lib/contracts";
import { findUser, USERS } from "@/lib/data/entities/users";
import { shareTitle, type ChannelOption, type ShareChannel, type ShareContact, type ShareRequest } from "@/lib/share/card";
import { recordShare } from "@/lib/server/audit";
import { lineSettings, pushLineMessages } from "@/lib/server/channels/line";
import { postTeamsCard, teamsSettings } from "@/lib/server/channels/teams";
import { teamsConversationOf } from "@/lib/server/channels/teams-conversations";
import { identityLinks } from "@/lib/server/identity";
import { personaOf } from "@/lib/server/portraits";
import { ports } from "@/lib/server/ports";
import { shareAdaptiveCard, shareEmail, shareFlex, shareUrl, type ShareMessage } from "./message";
import type { FallbackReason } from "@/lib/share/card";
import { shareableProblem, shareCode, shares, type Share, type ShareDelivery } from "./shares";

/** What creating a share returns: the record, or why nothing was sent. */
export type ShareOutcome = { ok: true; share: Share } | { ok: false; error: string };

function linkOf(userId: string, provider: "entra" | "line", tenant: string | null) {
  return identityLinks().find((link) => link.userId === userId && link.provider === provider && (tenant === null || link.tenant === tenant)) ?? null;
}

function teamsOption(userId: string): ChannelOption | null {
  const settings = teamsSettings();
  if (!settings || !linkOf(userId, "entra", settings.tenantId)) return null;
  return { channel: "teams", ready: teamsConversationOf(userId) !== null };
}

function lineOption(userId: string): ChannelOption | null {
  const settings = lineSettings();
  return settings && linkOf(userId, "line", settings.channelId) ? { channel: "line", ready: true } : null;
}

/** The channels that reach one person: email always, Teams when their Entra account is linked and a bot is configured, LINE when their LINE account is linked. */
export function channelsFor(userId: string): ChannelOption[] {
  return [{ channel: "email", ready: true }, teamsOption(userId), lineOption(userId)].filter((option): option is ChannelOption => option !== null);
}

/** Everyone a person can share with: every other user, with the channels that reach them. */
export function shareContacts(senderId: string): ShareContact[] {
  return USERS.filter((user) => user.id !== senderId).map((user) => ({ ...personaOf(user), channels: channelsFor(user.id) }));
}

function emailed(message: ShareMessage, sender: User, recipient: User, code: string): Promise<unknown> {
  const mail = shareEmail(message);
  return ports().mail.send({ kind: "share", fromUserId: sender.id, toUserId: recipient.id, toEmail: recipient.email, subject: mail.subject, body: mail.body, html: mail.html, refId: code });
}

async function sentElsewhere(channel: ShareChannel, message: ShareMessage, recipient: User): Promise<FallbackReason | null> {
  if (channel === "teams") {
    const conversation = teamsConversationOf(recipient.id);
    if (!conversation) return "no-teams-conversation";
    return (await postTeamsCard(conversation.threadId, shareAdaptiveCard(message))) ? null : "send-failed";
  }
  const settings = lineSettings();
  const link = settings ? linkOf(recipient.id, "line", settings.channelId) : null;
  if (!link) return "send-failed";
  return (await pushLineMessages(link.subject, [shareFlex(message)])) ? null : "send-failed";
}

async function deliver(message: ShareMessage, sender: User, recipient: User, asked: ShareChannel, code: string): Promise<ShareDelivery> {
  if (asked !== "email") {
    const fallback = await sentElsewhere(asked, message, recipient).catch((error: unknown) => {
      console.error("share delivery failed", asked, error);
      return "send-failed" as const;
    });
    if (!fallback) return { userId: recipient.id, asked, via: asked, fallback: null };
    await emailed(message, sender, recipient, code);
    return { userId: recipient.id, asked, via: "email", fallback };
  }
  await emailed(message, sender, recipient, code);
  return { userId: recipient.id, asked, via: "email", fallback: null };
}

function recipientsOf(request: ShareRequest, senderId: string): Array<{ user: User; channel: ShareChannel }> {
  const seen = new Set<string>([senderId]);
  return request.recipients.flatMap(({ userId, channel }) => {
    const user = findUser(userId);
    if (!user || seen.has(userId)) return [];
    seen.add(userId);
    return [{ user, channel }];
  });
}

/** Shares a card the person pressed share on: stores the reads (never their values) under a short code, sends each recipient the card's title and a button into Winyu on the channel picked (email when that channel cannot reach them), and leaves one audit row. */
export async function createShare(sender: User, request: ShareRequest, at = new Date().toISOString()): Promise<ShareOutcome> {
  const problem = shareableProblem(request.card);
  if (problem) return { ok: false, error: problem };
  const recipients = recipientsOf(request, sender.id);
  if (recipients.length === 0) return { ok: false, error: "no recipients" };
  const code = shareCode();
  const title = shareTitle(request.card);
  const note = request.note.trim() || null;
  const message: ShareMessage = { title, senderName: sender.nameTh, senderTitle: sender.title, note, url: shareUrl(code) };
  const deliveries: ShareDelivery[] = [];
  for (const { user, channel } of recipients) deliveries.push(await deliver(message, sender, user, channel, code));
  const share = shares().put({ id: code, at, senderId: sender.id, title, question: request.question, note, card: request.card, deliveries, views: 0, lastViewedAt: null });
  recordShare({ userId: sender.id, code, title, reads: request.card.reads.map((read) => read.tool), deliveries });
  return { ok: true, share };
}
