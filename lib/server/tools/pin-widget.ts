import type { z } from "zod";
import { pinWidgetInputSchema } from "@/lib/contracts";
import { pinNewWidget } from "@/lib/server/dashboard";
import { currentAccess } from "@/lib/server/request-context";
import { defineTool } from "./define";

export const pinWidgetTool = defineTool({
  name: "pin_widget",
  connector: "cop",
  tier: "write",
  roles: "all",
  description: "Pin the answer to the user's dashboard as a widget that re-runs its query on every load. Call it when the user asks to keep or pin a view. The user approves it first.",
  input: pinWidgetInputSchema,
  execute: async ({ title, kind, query }: z.infer<typeof pinWidgetInputSchema>) => {
    const widget = pinNewWidget(currentAccess(), { title, kind, query });
    return { ok: true as const, summary: `ปักการ์ด "${title}" บน Dashboard แล้ว`, data: { widgetId: widget.id, position: widget.position } };
  },
});
