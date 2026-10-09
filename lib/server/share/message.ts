import type { messagingApi } from "@line/bot-sdk";
import { TH } from "@/lib/i18n/th";
import { channelWebOrigin } from "@/lib/server/channels/config";
import { LIGHT_THEME_TOKENS, type LineMessage } from "@/lib/server/channels/line-flex";
import type { AdaptiveCard } from "@/lib/server/channels/teams-card";

const SHARE_PATH = "/s/";
const ADAPTIVE_SCHEMA = "http://adaptivecards.io/schemas/adaptive-card.json";
const ADAPTIVE_VERSION = "1.5";
const ALT_TEXT_MAX = 400;
const LINE_LABEL_MAX = 20;
const EMAIL_BACKGROUND = "#f8fafc";
const EMAIL_CARD = "#ffffff";
const EMAIL_BUTTON_TEXT = "#ffffff";
const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Everything a share message says: the card's title, who shared it, their note, and the link into Winyu. No value from the card travels. */
export type ShareMessage = { title: string; senderName: string; senderTitle: string; note: string | null; url: string };

/** A mail as Winyu lays it out: a lead line, a heading, a quote of someone's own words, a button with its link written out, and closing lines. */
export type MailLayout = { lead: string; heading: string; quote: string | null; button: { label: string; url: string } | null; foot: readonly string[] };

/** The short link a share opens at, on the public host people reach Winyu from. */
export function shareUrl(code: string): string {
  return `${channelWebOrigin()}${SHARE_PATH}${code}`;
}

function escaped(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/** A mail laid out as HTML in the light theme's tokens; every string in it is escaped here, so user text stays text. */
export function mailHtml(layout: MailLayout): string {
  const muted = `color:${LIGHT_THEME_TOKENS.mutedForeground};font-size:12px`;
  const quote = layout.quote
    ? `<p style="margin:16px 0 0;padding:12px 14px;border-left:3px solid ${LIGHT_THEME_TOKENS.border};color:${LIGHT_THEME_TOKENS.foreground};font-size:14px;line-height:1.6">${escaped(layout.quote)}</p>`
    : "";
  const button = layout.button
    ? `<p style="margin:24px 0 0"><a href="${escaped(layout.button.url)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:${LIGHT_THEME_TOKENS.primary};color:${EMAIL_BUTTON_TEXT};font-size:14px;font-weight:600;text-decoration:none">${escaped(layout.button.label)}</a></p>
<p style="margin:16px 0 0;${muted}">${escaped(TH.share.plainLink)} <a href="${escaped(layout.button.url)}" style="color:${LIGHT_THEME_TOKENS.primary}">${escaped(layout.button.url)}</a></p>`
    : "";
  const foot = layout.foot.map((line) => `<p style="margin:8px 0 0;${muted}">${escaped(line)}</p>`).join("\n");
  return `<!doctype html><html lang="th"><body style="margin:0;padding:24px;background:${EMAIL_BACKGROUND};font-family:system-ui,-apple-system,'Segoe UI',sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:${EMAIL_CARD};border:1px solid ${LIGHT_THEME_TOKENS.border};border-radius:16px">
<tr><td style="padding:24px">
<p style="margin:0;color:${LIGHT_THEME_TOKENS.mutedForeground};font-size:13px">${escaped(layout.lead)}</p>
<h1 style="margin:8px 0 0;color:${LIGHT_THEME_TOKENS.foreground};font-size:20px;line-height:1.4">${escaped(layout.heading)}</h1>
${quote}
${button}
${foot}
</td></tr></table></body></html>`;
}

/** The share as a mail: a subject, a plain body with the short link, and HTML with a button and the same link written out. */
export function shareEmail(message: ShareMessage): { subject: string; body: string; html: string } {
  const lead = TH.share.lead(message.senderName, message.senderTitle);
  const body = [lead, `"${message.title}"`, ...(message.note ? [`${TH.share.noteFrom(message.senderName)}: ${message.note}`] : []), `${TH.share.open}: ${message.url}`, TH.share.scopeNote].join("\n\n");
  const html = mailHtml({ lead, heading: message.title, quote: message.note, button: { label: TH.share.open, url: message.url }, foot: [TH.share.scopeNote] });
  return { subject: TH.share.subject(message.senderName, message.title), body, html };
}

/** The share as a Teams Adaptive Card: who shared what, their note, and an Action.OpenUrl button into Winyu. */
export function shareAdaptiveCard(message: ShareMessage): AdaptiveCard {
  const body: Record<string, unknown>[] = [
    { type: "TextBlock", text: TH.share.lead(message.senderName, message.senderTitle), wrap: true, isSubtle: true, size: "Small" },
    { type: "TextBlock", text: message.title, wrap: true, weight: "Bolder", size: "Large", spacing: "Small" },
  ];
  if (message.note) body.push({ type: "Container", style: "emphasis", spacing: "Medium", items: [{ type: "TextBlock", text: message.note, wrap: true }] });
  body.push({ type: "TextBlock", text: TH.share.scopeNote, wrap: true, isSubtle: true, size: "Small", spacing: "Medium" });
  return { type: "AdaptiveCard", $schema: ADAPTIVE_SCHEMA, version: ADAPTIVE_VERSION, body, actions: [{ type: "Action.OpenUrl", title: TH.share.open, url: message.url, style: "positive" }], msteams: { width: "Full" } };
}

/** The share as a LINE Flex bubble with a URI button; the notification text carries the short link for clients that cannot draw the bubble. */
export function shareFlex(message: ShareMessage): LineMessage {
  const muted = { size: "xs", color: LIGHT_THEME_TOKENS.mutedForeground, wrap: true } as const;
  const contents: messagingApi.FlexComponent[] = [
    { type: "text", text: TH.share.lead(message.senderName, message.senderTitle), ...muted },
    { type: "text", text: message.title, weight: "bold", size: "lg", wrap: true, color: LIGHT_THEME_TOKENS.foreground, margin: "sm" },
  ];
  if (message.note) contents.push({ type: "text", text: message.note, size: "sm", wrap: true, color: LIGHT_THEME_TOKENS.foreground, margin: "md" });
  contents.push({ type: "text", text: TH.share.scopeNote, ...muted, margin: "md" });
  const open: messagingApi.FlexButton = { type: "button", style: "primary", color: LIGHT_THEME_TOKENS.primary, action: { type: "uri", label: TH.share.open.slice(0, LINE_LABEL_MAX), uri: message.url } };
  return {
    type: "flex",
    altText: TH.share.altText(message.senderName, message.title, message.url).slice(0, ALT_TEXT_MAX),
    contents: { type: "bubble", body: { type: "box", layout: "vertical", spacing: "sm", contents }, footer: { type: "box", layout: "vertical", contents: [open] } },
  };
}
