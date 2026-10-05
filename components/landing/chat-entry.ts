import type { CardAction } from "@/components/cards/card-actions";

const CHAT_ENTRY = "/c/new";

/** What a new chat opens on: a question to send, a handoff packet to load, or a morning-investigation story to continue. */
export type ChatEntry = { prompt: string } | { preload: string } | { story: string };

/** The chat entry contract: `/c/new?prompt=…`, `?preload=<packetId>` or `?story=<storyId>`. */
export function chatHref(entry: ChatEntry): string {
  const [key, value] = Object.entries(entry)[0] as [string, string];
  return `${CHAT_ENTRY}?${key}=${encodeURIComponent(value)}`;
}

/** Where a card button outside the chat goes: the question it asks, or for a tool button its label as the request (the chat still asks for approval before any write). */
export function actionHref(action: CardAction): string | null {
  if (action.kind === "ask") return chatHref({ prompt: action.prompt });
  if (action.kind === "form") return chatHref({ prompt: action.label });
  const prompt = action.prompt ?? (action.tool ? action.label : null);
  return prompt ? chatHref({ prompt }) : null;
}
