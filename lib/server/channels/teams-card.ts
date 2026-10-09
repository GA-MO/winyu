import { TH } from "@/lib/i18n/th";

const SCHEMA = "http://adaptivecards.io/schemas/adaptive-card.json";
const VERSION = "1.5";

/** An Adaptive Card as Teams receives it in a message attachment. */
export type AdaptiveCard = { type: "AdaptiveCard"; $schema: string; version: string; body: Record<string, unknown>[]; actions: Record<string, unknown>[]; msteams: { width: "Full" } };

/** What Winyu says to anyone who writes to the bot: this chat only receives shared cards, and questions go to Winyu on the web. */
export function askOnWebCard(webOrigin: string): AdaptiveCard {
  return {
    type: "AdaptiveCard",
    $schema: SCHEMA,
    version: VERSION,
    body: [{ type: "TextBlock", text: TH.channels.askOnWeb, wrap: true }],
    actions: [{ type: "Action.OpenUrl", title: TH.channels.openWinyu, url: webOrigin }],
    msteams: { width: "Full" },
  };
}
