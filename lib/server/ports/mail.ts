import type { MailMessage, OutboxEntry } from "@/lib/contracts";

/** The mail system: delivers one message and returns it as sent. */
export type MailPort = { send(message: MailMessage): Promise<OutboxEntry> };
