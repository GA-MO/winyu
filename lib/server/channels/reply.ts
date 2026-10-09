import type { User } from "@/lib/contracts";
import { linkedUser, noteUnlinkedAttempt, type ExternalIdentity } from "@/lib/server/identity";

/** The only answers a chat app gets, none from a model: `ask-on-web` points to Winyu on the web (`user` is the linked sender of a private chat, else null); `unlinked` tells a private sender nobody linked how to get linked. */
export type FixedReply = { kind: "ask-on-web"; user: User | null } | { kind: "unlinked" };

/** Decides the fixed reply to a message written to the bot. A group gets the pointer to the web without any lookup; a private sender nobody linked is recorded for IT on /admin?tab=signin. */
export function fixedReplyTo(sender: ExternalIdentity | null, isPrivate: boolean, at: string): FixedReply {
  if (!isPrivate) return { kind: "ask-on-web", user: null };
  const user = sender ? linkedUser(sender) : null;
  if (user) return { kind: "ask-on-web", user };
  if (sender) noteUnlinkedAttempt(sender, at);
  return { kind: "unlinked" };
}
