import type { z } from "zod";
import { pinWidgetInputSchema, type AccessContext, type MetricQueryInput, type WidgetKind } from "@/lib/contracts";
import { presentCard } from "@/lib/cards/present";
import { resolveQuery } from "@/lib/semantic/periods";
import { pinQuestion } from "@/lib/share/pin";
import { displacedBy } from "@/lib/dashboard/one-per-metric";
import { layoutFor, pinNewWidget } from "@/lib/server/dashboard";
import { loadDictionary } from "@/lib/server/master-data";
import { runMetric } from "@/lib/server/metrics";
import { currentAccess, currentTurn } from "@/lib/server/request-context";
import { defineTool } from "./define";
import { ownBookQuery } from "./query-metric";
import { pinHolds } from "./verify";
import { TH } from "@/lib/i18n/th";

/** The query a pin keeps: what the person asked, narrowed to a rep's own agents exactly when query_metric narrowed it for the question that drew the card (AI-183), so the widget shows what the card showed. */
export async function pinnedQuery(asked: MetricQueryInput, access: AccessContext, question: string | null): Promise<MetricQueryInput> {
  return ownBookQuery(asked, access, question, await loadDictionary())?.input ?? asked;
}

/** What a pin approval shows: the figure the widget will lead with, and the titles of the pinned cards it moves to the tray. */
export type PinPreview = { hero: string | null; replaces: string[] };

/** What pinning this would do for this person: the figure the widget will lead with, as its card draws it in the widget's `kind` (a month_end widget leads with where the month closes), null when the query does not resolve or answer; and the pinned cards on the same metric it would move to the tray, by title, since one metric keeps one pinned card. No model call. */
export async function pinPreview(title: string, kind: WidgetKind, asked: MetricQueryInput, access: AccessContext, question: string | null): Promise<PinPreview> {
  const resolved = resolveQuery(await pinnedQuery(asked, access, question));
  if (!resolved.ok) return { hero: null, replaces: [] };
  const result = await runMetric(resolved.query, access);
  const hero = result.ok ? presentCard({ title, query: resolved.query, result, view: kind }).hero : null;
  const replaces = displacedBy(layoutFor(access).widgets, { kind, query: resolved.query }).map((widget) => widget.title);
  return { hero: hero ? [hero.value, hero.unit].filter(Boolean).join(" ") : null, replaces };
}

export const pinWidgetTool = defineTool({
  name: "pin_widget",
  connector: "winyu",
  tier: "write",
  roles: "all",
  description: "Pin the answer to the user's dashboard as a widget that re-runs its query on every load. Call it when the user asks to keep or pin a view; pass the query exactly as query_metric took it (a named period with range null works). kind month_end when the pin is about where this month will close against target (\"ปิดเดือนที่กี่ %\", the forecast card): a this_month query with compare target; otherwise the kind that matches the card. The user approves it first.",
  input: pinWidgetInputSchema,
  verify: pinHolds,
  execute: async ({ title, kind, query: asked }: z.infer<typeof pinWidgetInputSchema>) => {
    const screen = await currentTurn().screenCards?.();
    const question = pinQuestion(screen?.cards ?? [], asked, currentTurn().question);
    const resolved = resolveQuery(await pinnedQuery(asked, currentAccess(), question));
    if (!resolved.ok) return { ok: false as const, code: resolved.code, error: resolved.error };
    const { widget, replaced } = pinNewWidget(currentAccess(), { title, kind, query: resolved.query });
    const summary = replaced.length > 0 ? TH.dash.pinnedInstead(title, replaced.map((card) => card.title)) : TH.dash.pinned(title);
    return { ok: true as const, summary, data: { widgetId: widget.id, position: widget.position, replaced: replaced.map((card) => card.title) } };
  },
});
