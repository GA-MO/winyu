"use client";

let send: ((text: string) => void) | null = null;

/** The open chat registers itself here so a card button anywhere on the page can put a message into it. */
export function registerChatSender(next: ((text: string) => void) | null) {
  send = next;
}

export function sendToChat(text: string): boolean {
  if (!send) return false;
  send(text);
  return true;
}
