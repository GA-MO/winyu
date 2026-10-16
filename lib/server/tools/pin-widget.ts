import type { z } from "zod";
import { pinWidgetInputSchema } from "@/lib/contracts";
import { resolveQuery } from "@/lib/semantic/periods";
import { pinNewWidget } from "@/lib/server/dashboard";
import { currentAccess } from "@/lib/server/request-context";
import { defineTool } from "./define";
import { pinHolds } from "./verify";
import { TH } from "@/lib/i18n/th";

export const pinWidgetTool = defineTool({
  name: "pin_widget",
  connector: "winyu",
  tier: "write",
  roles: "all",
  description: "Pin the answer to the user's dashboard as a widget that re-runs its query on every load. Call it when the user asks to keep or pin a view; pass the query exactly as query_metric took it (a named period with range null works). The user approves it first.",
  input: pinWidgetInputSchema,
  verify: pinHolds,
  execute: async ({ title, kind, query: asked }: z.infer<typeof pinWidgetInputSchema>) => {
    const resolved = resolveQuery(asked);
    if (!resolved.ok) return { ok: false as const, code: resolved.code, error: resolved.error };
    const { widget, replaced } = pinNewWidget(currentAccess(), { title, kind, query: resolved.query });
    const summary = replaced.length > 0 ? TH.dash.pinnedInstead(title, replaced.map((card) => card.title)) : TH.dash.pinned(title);
    return { ok: true as const, summary, data: { widgetId: widget.id, position: widget.position, replaced: replaced.map((card) => card.title) } };
  },
});
