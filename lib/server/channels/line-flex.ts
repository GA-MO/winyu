import type { messagingApi } from "@line/bot-sdk";
import type { Tone } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";
import type { ApprovalPrompt, ChannelCard, ChannelReply, ChannelRow } from "./types";

/** LINE takes colours as hex only, so a Flex message uses the light theme's token values from app/globals.css. */
export const LIGHT_THEME_TOKENS = { foreground: "#0f172a", mutedForeground: "#64748b", primary: "#4f46e5", success: "#059669", warning: "#d97706", danger: "#e11d48", border: "#e2e8f0" } as const;

const TONE_COLOR: Record<Tone, string> = { good: LIGHT_THEME_TOKENS.success, bad: LIGHT_THEME_TOKENS.danger, neutral: LIGHT_THEME_TOKENS.mutedForeground };
const ALT_TEXT_MAX = 400;
const TEXT_MAX = 2000;
const LABEL_MAX = 20;
const APPROVAL_PARAM = "approval";
const DECISION_PARAM = "approve";

type FlexNode = messagingApi.FlexComponent;
type FlexTextOptions = Partial<Omit<messagingApi.FlexText, "type" | "text">>;

/** A LINE message as the Messaging API takes it: plain text, or a Flex bubble with its notification text. */
export type LineMessage = messagingApi.TextMessage | messagingApi.FlexMessage;

/** What an approval button sends back as postback data: the held approval's id and the decision. */
export function approvalPostback(approvalId: string, approved: boolean): string {
  return new URLSearchParams({ [APPROVAL_PARAM]: approvalId, [DECISION_PARAM]: approved ? "1" : "0" }).toString();
}

/** Reads an approval button's postback data; null for any other postback. */
export function decisionOfPostback(data: string): { approvalId: string; approved: boolean } | null {
  const params = new URLSearchParams(data);
  const approvalId = params.get(APPROVAL_PARAM);
  const decision = params.get(DECISION_PARAM);
  return approvalId && (decision === "1" || decision === "0") ? { approvalId, approved: decision === "1" } : null;
}

function text(value: string, options: FlexTextOptions = {}): messagingApi.FlexText {
  return { type: "text", text: value.slice(0, TEXT_MAX), wrap: true, color: LIGHT_THEME_TOKENS.foreground, size: "sm", ...options };
}

function rowBox(row: ChannelRow): messagingApi.FlexBox {
  const value: FlexNode[] = [text(row.value, { align: "end", weight: "bold" })];
  if (row.delta) value.push(text(row.delta, { align: "end", size: "xs", color: TONE_COLOR[row.tone] }));
  return { type: "box", layout: "horizontal", spacing: "md", margin: "sm", contents: [{ ...text(row.label), flex: 3 }, { type: "box", layout: "vertical", flex: 2, contents: value }] };
}

function separator(): messagingApi.FlexSeparator {
  return { type: "separator", margin: "lg", color: LIGHT_THEME_TOKENS.border };
}

function cardBox(card: ChannelCard): FlexNode[] {
  const contents: FlexNode[] = [text(card.title, { weight: "bold", size: "md", margin: "lg" })];
  if (card.meta) contents.push(text(card.meta, { size: "xxs", color: LIGHT_THEME_TOKENS.mutedForeground }));
  if (card.denied) contents.push(text(card.denied, { color: LIGHT_THEME_TOKENS.danger, margin: "sm" }));
  if (card.hero) {
    contents.push(text(card.hero.label, { size: "xs", color: LIGHT_THEME_TOKENS.mutedForeground, margin: "md" }));
    contents.push(text(card.hero.value, { size: "xxl", weight: "bold" }));
    if (card.hero.delta) contents.push(text(card.hero.delta, { size: "sm", weight: "bold", color: TONE_COLOR[card.hero.tone] }));
    if (card.hero.detail) contents.push(text(card.hero.detail, { size: "xs", color: LIGHT_THEME_TOKENS.mutedForeground }));
  }
  contents.push(...card.rows.map(rowBox));
  if (card.more > 0) contents.push(text(TH.channels.more(card.more), { size: "xs", color: LIGHT_THEME_TOKENS.mutedForeground, margin: "md" }));
  if (card.note) contents.push(text(card.note, { size: "xxs", color: LIGHT_THEME_TOKENS.mutedForeground, margin: "sm" }));
  return contents;
}

function approvalBox(approval: ApprovalPrompt): FlexNode[] {
  const contents: FlexNode[] = [
    text(TH.channels.waiting, { size: "xs", weight: "bold", color: LIGHT_THEME_TOKENS.warning, margin: "lg" }),
    text(approval.question, { weight: "bold" }),
  ];
  if (approval.effect) contents.push(text(approval.effect, { size: "xs", color: LIGHT_THEME_TOKENS.mutedForeground }));
  return contents;
}

function postbackButton(label: string, approvalId: string, approved: boolean): messagingApi.FlexButton {
  return {
    type: "button",
    style: approved ? "primary" : "secondary",
    ...(approved ? { color: LIGHT_THEME_TOKENS.primary } : {}),
    height: "sm",
    action: { type: "postback", label: label.slice(0, LABEL_MAX), data: approvalPostback(approvalId, approved), displayText: label },
  };
}

function linkButton(label: string, uri: string): messagingApi.FlexButton {
  return { type: "button", style: "link", height: "sm", action: { type: "uri", label: label.slice(0, LABEL_MAX), uri } };
}

function altTextOf(reply: Extract<ChannelReply, { kind: "answer" }>): string {
  if (reply.approval) return TH.channels.approvalAlt;
  const first = reply.cards[0];
  const summary = first ? TH.channels.altText([first.title, first.hero?.value].filter(Boolean).join(" ")) : reply.text || TH.channels.answerAlt;
  return summary.slice(0, ALT_TEXT_MAX);
}

/** One mascop answer as a LINE Flex bubble: the words, each card with its headline and coloured change first, the approval with approve and reject postback buttons, and the way to the thread in the web. */
export function flexOf(reply: Extract<ChannelReply, { kind: "answer" }>): LineMessage {
  const sections: FlexNode[][] = [...(reply.text ? [[text(reply.text, { size: "md" })]] : []), ...reply.cards.map(cardBox), ...(reply.approval ? [approvalBox(reply.approval)] : [])];
  const body = sections.flatMap((section, index) => (index === 0 ? section : [separator(), ...section]));
  const footer: FlexNode[] = [];
  if (reply.approval) footer.push(postbackButton(TH.channels.approve, reply.approval.id, true), postbackButton(TH.channels.reject, reply.approval.id, false));
  footer.push(linkButton(TH.channels.openWeb, reply.webUrl));
  return {
    type: "flex",
    altText: altTextOf(reply),
    contents: { type: "bubble", size: "giga", body: { type: "box", layout: "vertical", spacing: "sm", contents: body }, footer: { type: "box", layout: "vertical", spacing: "sm", contents: footer } },
  };
}

/** A notice, or the account-link prompt with its sign-in button. */
export function lineNoticeOf(message: string, link: { label: string; uri: string } | null = null): LineMessage {
  if (!link) return { type: "text", text: message };
  return {
    type: "flex",
    altText: message.slice(0, ALT_TEXT_MAX),
    contents: { type: "bubble", body: { type: "box", layout: "vertical", contents: [text(message)] }, footer: { type: "box", layout: "vertical", contents: [{ type: "button", style: "primary", color: LIGHT_THEME_TOKENS.primary, action: { type: "uri", label: link.label.slice(0, LABEL_MAX), uri: link.uri } }] } },
  };
}
