import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { pinWidgetInputSchema, type WidgetSpec } from "@/lib/contracts";
import { layoutOf, layouts } from "@/lib/server/agent/collections";
import { currentAccess } from "@/lib/server/request-context";
import { defineTool } from "./define";
import { now } from "./shared";

export const pinWidgetTool = defineTool({
  name: "pin_widget",
  connector: "cop",
  tier: "write",
  roles: "all",
  description: "Pin the answer to the user's dashboard as a widget that re-runs its query on every load. Call it when the user asks to keep or pin a view. The user approves it first.",
  input: pinWidgetInputSchema,
  execute: async ({ title, kind, query }: z.infer<typeof pinWidgetInputSchema>) => {
    const access = currentAccess();
    const layout = layoutOf(access.userId);
    const widget: WidgetSpec = {
      id: randomUUID(),
      userId: access.userId,
      title,
      kind,
      query,
      pinned: true,
      position: layout.widgets.length,
      source: "user_pin",
      reason: null,
      createdAt: now(),
      version: layout.version + 1,
    };
    layouts().put({ id: access.userId, userId: access.userId, version: layout.version + 1, widgets: [...layout.widgets, widget], updatedAt: now() });
    return { ok: true as const, summary: `ปักการ์ด "${title}" บน Dashboard แล้ว`, data: { widgetId: widget.id, position: widget.position } };
  },
});
