import type { RecipientScope, User } from "@/lib/contracts";
import { findUser, USERS } from "@/lib/data/entities/users";
import { shareTitle, type ChannelOption, type DeliveryChannel, type ShareChannel, type ShareContact, type ShareGrantReceipt, type ShareRequest } from "@/lib/share/card";
import type { Matter, MatterUrgency, ShareDelivery } from "@/lib/share/matter";
import { recordShare } from "@/lib/server/audit";
import { untilLabel } from "@/lib/share/grant-label";
import { grantOnShare, recipientScopesFor, shareGrantUntil } from "@/lib/server/grants";
import { notify } from "@/lib/server/notify";
import { lineSettings, pushLineMessages } from "@/lib/server/channels/line";
import { postTeamsCard, teamsSettings } from "@/lib/server/channels/teams";
import { teamsConversationOf } from "@/lib/server/channels/teams-conversations";
import { identityLinks } from "@/lib/server/identity";
import { personaOf } from "@/lib/server/portraits";
import { ports } from "@/lib/server/ports";
import { shareAdaptiveCard, shareEmail, shareFlex, shareUrl, type ShareMessage } from "./message";
import type { FallbackReason } from "@/lib/share/card";
import { shareableProblem, shareCode, shares } from "./shares";

/** What creating a share returns: the record, the grants given, and what the card still hides from each recipient; or why nothing was sent. */
export type ShareOutcome = { ok: true; share: Matter; grants: ShareGrantReceipt[]; hidden: RecipientScope[] } | { ok: false; error: string };

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
  return USERS.filter((user) => user.id !== senderId).map((user) => ({ ...personaOf(user), name: user.name, channels: channelsFor(user.id) }));
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

async function deliver(message: ShareMessage, sender: User, recipient: User, asked: DeliveryChannel, code: string): Promise<ShareDelivery> {
  if (asked === "winyu") return { userId: recipient.id, asked, via: asked, fallback: null };
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

function recipientsOf(request: ShareRequest, senderId: string): Array<{ user: User; channel: DeliveryChannel }> {
  const seen = new Set<string>([senderId]);
  return request.recipients.flatMap(({ userId, channel }) => {
    const user = findUser(userId);
    if (!user || seen.has(userId)) return [];
    seen.add(userId);
    return [{ user, channel }];
  });
}

const URGENCY_OF_INTENT: Record<Matter["intent"], MatterUrgency> = { act: "today", fyi: "this_week" };

function newMatter(sender: User, request: ShareRequest, sent: { code: string; at: string; title: string; ask: string; deliveries: ShareDelivery[] }): Matter {
  const path = sent.deliveries.map((delivery) => ({ userId: delivery.userId, fromUserId: sender.id, at: sent.at, state: "sent" as const }));
  return { id: sent.code, at: sent.at, updatedAt: sent.at, senderId: sender.id, title: sent.title, question: request.question, ask: sent.ask, intent: request.intent, urgency: URGENCY_OF_INTENT[request.intent], goal: null, path, thread: [], status: "open", card: request.card, deliveries: sent.deliveries, openedBy: [], lastViewedAt: null };
}

/** Sends a card as a matter: stores the reads (never their values) under a short code, tells each recipient in Winyu (in the Inbox when it asks for an answer, on Shared when it is for information), also on the outside channel picked (email when that channel cannot reach them), and leaves one audit row; with grant days, also grants each recipient what the card showed the sender, when the sender may. No model call. */
export async function createShare(sender: User, request: ShareRequest, at = new Date().toISOString()): Promise<ShareOutcome> {
  const problem = shareableProblem(request.card);
  if (problem) return { ok: false, error: problem };
  const recipients = recipientsOf(request, sender.id);
  if (recipients.length === 0) return { ok: false, error: "no recipients" };
  const code = shareCode();
  const title = shareTitle(request.card);
  const ask = request.ask.trim();
  const message: ShareMessage = { title, senderName: sender.nameTh, senderTitle: sender.title, note: ask || null, url: shareUrl(code) };
  const deliveries: ShareDelivery[] = [];
  for (const { user, channel } of recipients) deliveries.push(await deliver(message, sender, user, channel, code));
  const share = shares().put(newMatter(sender, request, { code, at, title, ask, deliveries }));
  recordShare({ userId: sender.id, code, title, reads: request.card.reads.map((read) => read.tool), deliveries });
  const grants = request.grantDays ? grantOnShare(sender, request.card, deliveries.map((delivery) => delivery.userId), request.grantDays, code, new Date(at)) : [];
  for (const delivery of deliveries) {
    const until = shareGrantUntil(code, delivery.userId);
    const event = share.intent === "act" ? { kind: "matter" as const, refId: code, senderName: sender.nameTh, ask } : { kind: "share" as const, refId: code, senderName: sender.nameTh, cardTitle: title, grantUntil: until ? untilLabel(until) : null };
    notify(delivery.userId, sender.id, event, new Date(at));
  }
  return { ok: true, share, grants, hidden: recipientScopesFor(sender, request.card, deliveries.map((delivery) => delivery.userId), new Date(at)) };
}
