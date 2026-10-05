import { createHash } from "node:crypto";
import { CHANNELS, type Channel } from "./types";

const THREAD_HASH_CHARS = 32;
const SEPARATOR = "-";

/** The Winyu thread one person's private chat with the bot lives in: stable per chat app conversation and person, so the web rail shows it and the next message continues it. */
export function channelThreadId(channel: Channel, conversation: string, userId: string): string {
  return `${channel}${SEPARATOR}${createHash("sha256").update(`${conversation}\n${userId}`).digest("hex").slice(0, THREAD_HASH_CHARS)}`;
}

/** The chat app a thread was started from, or null for a web thread. */
export function channelOfThread(threadId: string): Channel | null {
  return CHANNELS.find((channel) => threadId.startsWith(`${channel}${SEPARATOR}`) && threadId.length === channel.length + SEPARATOR.length + THREAD_HASH_CHARS) ?? null;
}
