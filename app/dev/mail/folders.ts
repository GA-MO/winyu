import type { OutboxEntry } from "@/lib/contracts";

/** The two folders of the demo mail client. */
export type MailFolder = "inbox" | "sent";

const PERSON_SENT: Readonly<Record<OutboxEntry["kind"], boolean>> = { handoff: true, email: true, share: true, watch: false, digest: false };

function newestFirst(left: OutboxEntry, right: OutboxEntry): number {
  return right.at.localeCompare(left.at);
}

/** A persona's mail by folder, newest first: the inbox is every entry addressed to them, whatever its kind; sent is what they sent as a person (Winyu's watch alerts and digest are no one's sent mail). */
export function mailboxOf(entries: readonly OutboxEntry[], userId: string): Record<MailFolder, OutboxEntry[]> {
  return {
    inbox: entries.filter((entry) => entry.toUserId === userId).sort(newestFirst),
    sent: entries.filter((entry) => entry.fromUserId === userId && PERSON_SENT[entry.kind]).sort(newestFirst),
  };
}
