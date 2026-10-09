import type { messagingApi } from "@line/bot-sdk";

/** LINE takes colours as hex only, so a Flex message uses the light theme's token values from app/globals.css. */
export const LIGHT_THEME_TOKENS = { foreground: "#0f172a", mutedForeground: "#64748b", primary: "#4f46e5", border: "#e2e8f0" } as const;

const ALT_TEXT_MAX = 400;
const TEXT_MAX = 2000;
const LABEL_MAX = 20;

/** A LINE message as the Messaging API takes it: plain text, or a Flex bubble with its notification text. */
export type LineMessage = messagingApi.TextMessage | messagingApi.FlexMessage;

/** A notice, or a notice with one button: the account-link prompt, or the way to Winyu on the web. */
export function lineNoticeOf(message: string, link: { label: string; uri: string } | null = null): LineMessage {
  if (!link) return { type: "text", text: message };
  const body: messagingApi.FlexText = { type: "text", text: message.slice(0, TEXT_MAX), wrap: true, color: LIGHT_THEME_TOKENS.foreground, size: "sm" };
  const button: messagingApi.FlexButton = { type: "button", style: "primary", color: LIGHT_THEME_TOKENS.primary, action: { type: "uri", label: link.label.slice(0, LABEL_MAX), uri: link.uri } };
  return {
    type: "flex",
    altText: message.slice(0, ALT_TEXT_MAX),
    contents: { type: "bubble", body: { type: "box", layout: "vertical", contents: [body] }, footer: { type: "box", layout: "vertical", contents: [button] } },
  };
}
