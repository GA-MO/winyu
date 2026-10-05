import { actionRequest } from "@/components/cards/action-tool";
import type { CardAction } from "@/components/cards/card-actions";
import { pressParam } from "@/components/chat/pressed";

const CHAT_ENTRY = "/c/new";

/** What a new chat opens on: a question to send, a handoff packet to load, a morning-investigation story to continue, or a pressed tool button. */
export type ChatEntry = { prompt: string } | { preload: string } | { story: string } | { press: string };

/** The chat entry contract: `/c/new?prompt=…`, `?preload=<packetId>`, `?story=<storyId>` or `?press=<tool button>`. */
export function chatHref(entry: ChatEntry): string {
  const [key, value] = Object.entries(entry)[0] as [string, string];
  return `${CHAT_ENTRY}?${key}=${encodeURIComponent(value)}`;
}

/** Where a card button outside the chat goes: the same request the in-chat button sends, a question as `prompt` and a tool button as `press` (the chat still asks for approval before any write). */
export function actionHref(action: CardAction): string | null {
  const request = actionRequest(action);
  if (!request) return null;
  if (request.kind === "ask") return chatHref({ prompt: request.prompt });
  return chatHref({ press: pressParam({ tool: request.tool, input: request.input, label: request.label }) });
}
