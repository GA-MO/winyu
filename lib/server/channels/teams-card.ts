import type { Tone } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";
import type { ApprovalPrompt, ChannelCard, ChannelReply, ChannelRow } from "./types";

/** The action ids an approval card's buttons submit; the value is the held approval's id. */
export const TEAMS_APPROVE = "mascop.approve";
export const TEAMS_REJECT = "mascop.reject";

const SCHEMA = "http://adaptivecards.io/schemas/adaptive-card.json";
const VERSION = "1.5";

type Element = Record<string, unknown>;

/** An Adaptive Card as Teams receives it in a message attachment. */
export type AdaptiveCard = { type: "AdaptiveCard"; $schema: string; version: string; body: Element[]; actions: Element[]; msteams: { width: "Full" } };

const TONE_COLOR: Record<Tone, string> = { good: "Good", bad: "Attention", neutral: "Default" };

function textBlock(text: string, options: Element = {}): Element {
  return { type: "TextBlock", text, wrap: true, ...options };
}

function rowLine(row: ChannelRow): Element {
  const value = [textBlock(row.value, { horizontalAlignment: "Right", weight: "Bolder", spacing: "None" })];
  if (row.delta) value.push(textBlock(row.delta, { horizontalAlignment: "Right", size: "Small", color: TONE_COLOR[row.tone], spacing: "None" }));
  return {
    type: "ColumnSet",
    spacing: "Small",
    columns: [
      { type: "Column", width: "stretch", items: [textBlock(row.label)] },
      { type: "Column", width: "auto", items: value },
    ],
  };
}

function cardContainer(card: ChannelCard): Element {
  const items: Element[] = [textBlock(card.title, { weight: "Bolder", size: "Medium" })];
  if (card.meta) items.push(textBlock(card.meta, { isSubtle: true, size: "Small", spacing: "None" }));
  if (card.denied) items.push(textBlock(card.denied, { color: "Attention" }));
  if (card.hero) {
    items.push(textBlock(card.hero.value, { size: "ExtraLarge", weight: "Bolder", spacing: "Small" }));
    const change = [card.hero.delta, card.hero.label].filter(Boolean).join(" ");
    if (change) items.push(textBlock(change, { color: TONE_COLOR[card.hero.tone], spacing: "None" }));
  }
  items.push(...card.rows.map(rowLine));
  if (card.more > 0) items.push(textBlock(TH.channels.more(card.more), { isSubtle: true, size: "Small" }));
  if (card.note) items.push(textBlock(card.note, { isSubtle: true, size: "Small" }));
  return { type: "Container", style: "emphasis", bleed: false, spacing: "Medium", items };
}

function approvalContainer(approval: ApprovalPrompt): Element {
  const items: Element[] = [textBlock(TH.channels.waiting, { size: "Small", color: "Warning", weight: "Bolder" }), textBlock(approval.question, { weight: "Bolder" })];
  if (approval.effect) items.push(textBlock(approval.effect, { isSubtle: true, size: "Small" }));
  return { type: "Container", style: "warning", spacing: "Medium", items };
}

function approvalActions(approval: ApprovalPrompt): Element[] {
  return [
    { type: "Action.Submit", title: TH.channels.approve, style: "positive", data: { actionId: TEAMS_APPROVE, value: approval.id } },
    { type: "Action.Submit", title: TH.channels.reject, data: { actionId: TEAMS_REJECT, value: approval.id } },
  ];
}

/** One mascop answer as a single Adaptive Card: the words, each card with its headline and coloured change first, the approval with approve and reject buttons, and the way to the thread in the web. */
export function adaptiveCardOf(reply: Extract<ChannelReply, { kind: "answer" }>): AdaptiveCard {
  const body: Element[] = [];
  if (reply.text) body.push(textBlock(reply.text));
  body.push(...reply.cards.map(cardContainer));
  if (reply.approval) body.push(approvalContainer(reply.approval));
  const actions = [...(reply.approval ? approvalActions(reply.approval) : []), { type: "Action.OpenUrl", title: TH.channels.openWeb, url: reply.webUrl }];
  return { type: "AdaptiveCard", $schema: SCHEMA, version: VERSION, body, actions, msteams: { width: "Full" } };
}
