import { randomUUID } from "node:crypto";
import { liveAccessFor } from "@/lib/access/enforce";
import type { User } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { linkedUser, noteUnlinkedAttempt } from "@/lib/server/identity";
import { heldApproval, holdApproval, promptOf } from "./approvals";
import { channelCardsOf } from "./cards";
import { channelThreadId } from "./thread-id";
import { converse, type ChannelMessage, type ChannelTurn } from "./turn";
import type { Channel, ChannelInbound, ChannelReply } from "./types";

/** Where the person continues a thread in the web app. */
export function threadUrl(webOrigin: string, threadId: string): string {
  return `${webOrigin}/c/${encodeURIComponent(threadId)}`;
}

function notice(text: string): ChannelReply {
  return { kind: "notice", text };
}

function replyOf(turn: ChannelTurn, channel: Channel, user: User, threadId: string, message: ChannelMessage, webOrigin: string): ChannelReply {
  if (turn.spent) return notice(TH.harness.approvalSpent);
  if (turn.error && !turn.text) return notice(TH.channels.failed);
  const asked = turn.asked[0];
  const askedArgs = asked ? (asked.args ?? turn.calls.find((call) => call.toolCallId === asked.toolCallId)?.args) : undefined;
  const approval = asked ? promptOf(holdApproval(channel, user.id, threadId, message, asked, askedArgs ?? {})) : null;
  return { kind: "answer", text: turn.text, cards: channelCardsOf(turn.calls, turn.composed), approval, webUrl: threadUrl(webOrigin, threadId) };
}

/** Answers one verified chat app event as the Winyu user its sender is linked to, through the same harness as the web chat; a sender nobody linked gets only the way to get linked (and IT sees the attempt), and a shared conversation gets no data at all. */
export async function answerChannel(inbound: ChannelInbound, webOrigin: string): Promise<ChannelReply> {
  if (!inbound.place.private) return notice(TH.channels.privateOnly);
  const user = linkedUser(inbound.sender);
  if (!user) {
    noteUnlinkedAttempt(inbound.sender, new Date().toISOString());
    return { kind: "unlinked" };
  }
  const access = liveAccessFor(user);
  if (inbound.kind === "ask") {
    const threadId = channelThreadId(inbound.channel, inbound.place.conversation, user.id);
    const message = { id: randomUUID(), content: inbound.text };
    return replyOf(await converse(access, inbound.channel, threadId, message, null), inbound.channel, user, threadId, message, webOrigin);
  }
  const held = heldApproval(inbound.approvalId);
  if (!held || held.userId !== user.id || held.channel !== inbound.channel) return notice(TH.channels.unknownApproval);
  const turn = await converse(access, inbound.channel, held.threadId, held.message, { interruptId: held.interruptId, approved: inbound.approved });
  return replyOf(turn, inbound.channel, user, held.threadId, held.message, webOrigin);
}
