import type { Inbound, Sent } from "@/scripts/channels-sim";

/** One persona as the demo simulator links them: their Entra object id for Teams and their LINE user id. */
export type DemoPerson = { userId: string; nameTh: string; title: string; oid: string; lineUserId: string };

/** An Adaptive Card element of the subset Winyu sends (TextBlock, ColumnSet, Column, Container). */
export type AdaptiveElement = {
  type: string;
  text?: string;
  weight?: string;
  size?: string;
  color?: string;
  isSubtle?: boolean;
  horizontalAlignment?: string;
  spacing?: string;
  style?: string;
  width?: string;
  items?: AdaptiveElement[];
  columns?: AdaptiveElement[];
};

/** An Adaptive Card action: Action.Submit carries Winyu's action id and value, Action.OpenUrl a link. */
export type AdaptiveAction = { type: string; title?: string; style?: string; url?: string; data?: { actionId?: string; value?: string } };

export type AdaptiveCardJson = { body?: AdaptiveElement[]; actions?: AdaptiveAction[] };

/** A LINE Flex action: a postback with its data, or a URI. */
export type FlexAction = { type: string; label?: string; data?: string; displayText?: string; uri?: string };

/** A LINE Flex component of the subset Winyu sends (box, text, separator, button). */
export type FlexNode = {
  type: string;
  layout?: string;
  contents?: FlexNode[];
  text?: string;
  size?: string;
  color?: string;
  weight?: string;
  align?: string;
  margin?: string;
  spacing?: string;
  flex?: number;
  style?: string;
  action?: FlexAction;
};

export type FlexBubble = { body?: FlexNode; footer?: FlexNode };

/** One thing a chat pane draws, oldest first. */
export type Bubble =
  | { kind: "mine"; seq: number; text: string }
  | { kind: "text"; seq: number; text: string }
  | { kind: "adaptive"; seq: number; card: AdaptiveCardJson }
  | { kind: "flex"; seq: number; bubble: FlexBubble };

/** A pane's chat: what to draw, and whether Winyu is still answering the last thing the person sent. */
export type Chat = { bubbles: Bubble[]; typing: boolean };

type TeamsActivity = { type?: string; text?: string; attachments?: { content?: AdaptiveCardJson }[] };
type LineMessages = { messages?: { type?: string; text?: string; contents?: FlexBubble }[] };

const WAITING_KINDS = new Set(["inbound", "typing", "loading"]);
const LOOPBACK_SWAP: Record<string, string> = { localhost: "127.0.0.1", "127.0.0.1": "localhost" };
const SIGN_IN_AS_PATH = "/dev/as";

/** The Teams conversation the simulator writes a persona's private chat with the bot in. */
export function teamsThreadOf(person: DemoPerson): string {
  return `a:dm-${person.oid}`;
}

function teamsBubbles(entry: Sent): Bubble[] {
  if (entry.kind !== "message") return [];
  const activity = entry.body as TeamsActivity;
  const cards = (activity.attachments ?? []).flatMap((attachment): Bubble[] => (attachment.content ? [{ kind: "adaptive", seq: entry.seq, card: attachment.content }] : []));
  if (cards.length > 0) return cards;
  return activity.text ? [{ kind: "text", seq: entry.seq, text: activity.text }] : [];
}

function lineBubbles(entry: Sent): Bubble[] {
  if (entry.kind !== "reply" && entry.kind !== "push") return [];
  return ((entry.body as LineMessages).messages ?? []).flatMap((message): Bubble[] => {
    if (message.type === "flex" && message.contents) return [{ kind: "flex", seq: entry.seq, bubble: message.contents }];
    return message.text ? [{ kind: "text", seq: entry.seq, text: message.text }] : [];
  });
}

function bubblesOf(entry: Sent): Bubble[] {
  if (entry.kind === "inbound") return [{ kind: "mine", seq: entry.seq, text: (entry.body as Inbound).text }];
  return entry.channel === "teams" ? teamsBubbles(entry) : lineBubbles(entry);
}

/** One chat out of the simulator's feed: every entry of that channel and thread as bubbles, and a typing flag while the last entry is the person's own or a typing signal. */
export function chatOf(entries: readonly Sent[], channel: Sent["channel"], thread: string): Chat {
  const mine = entries.filter((entry) => entry.channel === channel && entry.thread === thread);
  const last = mine.at(-1);
  return { bubbles: mine.flatMap(bubblesOf), typing: last !== undefined && WAITING_KINDS.has(last.kind) };
}

/** Where a pane opens a link: a link into this Winyu (a loopback host on the page's port) opens on the other loopback host through /dev/as, signed in as the pane's persona, so the presenter's own tab keeps its session; any other link opens as it is. */
export function paneLinkOf(link: string, page: { protocol: string; hostname: string; port: string }, userId: string): string {
  const url = new URL(link);
  const other = LOOPBACK_SWAP[page.hostname];
  if (!other || !LOOPBACK_SWAP[url.hostname] || url.port !== page.port) return link;
  const query = new URLSearchParams({ user: userId, next: `${url.pathname}${url.search}${url.hash}` });
  return `${page.protocol}//${other}:${page.port}${SIGN_IN_AS_PATH}?${query.toString()}`;
}
