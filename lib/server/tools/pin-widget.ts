import type { z } from "zod";
import { pinWidgetInputSchema } from "@/lib/contracts";
import { pinNewWidget } from "@/lib/server/dashboard";
import { currentAccess } from "@/lib/server/request-context";
import { defineTool } from "./define";
import { TH } from "@/lib/i18n/th";

export const pinWidgetTool = defineTool({
  name: "pin_widget",
  connector: "winyu",
  tier: "write",
  roles: "all",
  description: "Pin the answer to the user's dashboard as a widget that re-runs its query on every load. Call it when the user asks to keep or pin a view. The user approves it first.",
  input: pinWidgetInputSchema,
  execute: async ({ title, kind, query }: z.infer<typeof pinWidgetInputSchema>) => {
    const { widget, replaced } = pinNewWidget(currentAccess(), { title, kind, query });
    const summary = replaced.length > 0 ? TH.dash.pinnedInstead(title, replaced.map((card) => card.title)) : TH.dash.pinned(title);
    return { ok: true as const, summary, data: { widgetId: widget.id, position: widget.position, replaced: replaced.map((card) => card.title) } };
  },
});
