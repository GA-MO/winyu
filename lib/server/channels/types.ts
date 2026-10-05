import type { Tone } from "@/lib/dashboard/metric-display";
import type { ExternalIdentity } from "@/lib/server/identity";

export const CHANNELS = ["teams", "line"] as const;

/** A chat app people reach Winyu from; also the initiator their tool calls are audited under. */
export type Channel = (typeof CHANNELS)[number];

/** Where a message was written: its conversation in the chat app, and whether only the sender and the bot read it. */
export type ChannelPlace = { conversation: string; private: boolean };

/** One verified thing a person did in a chat app: asked a question, or pressed approve or reject on an approval Winyu posted. */
export type ChannelInbound =
  | { kind: "ask"; channel: Channel; sender: ExternalIdentity; place: ChannelPlace; text: string }
  | { kind: "decide"; channel: Channel; sender: ExternalIdentity; place: ChannelPlace; approvalId: string; approved: boolean };

export type ChannelRow = { label: string; value: string; delta: string | null; tone: Tone };

export type ChannelHero = { label: string; value: string; delta: string | null; detail: string | null; tone: Tone };

/** A card squeezed for a chat app: the headline and its coloured change first, a few rows, how many rows the web shows beyond them, and a refusal in place of data when the tool refused. */
export type ChannelCard = { title: string; meta: string | null; hero: ChannelHero | null; rows: ChannelRow[]; more: number; note: string | null; denied: string | null };

/** A write the agent wants to make, waiting for the person's yes or no in the chat app. */
export type ApprovalPrompt = { id: string; question: string; effect: string | null };

/** What Winyu says back to one inbound, before a chat app draws it. `unlinked`: the sender maps to no Winyu user, so the channel tells them how to get linked and nothing else. */
export type ChannelReply =
  | { kind: "answer"; text: string; cards: ChannelCard[]; approval: ApprovalPrompt | null; webUrl: string }
  | { kind: "notice"; text: string }
  | { kind: "unlinked" };
