import type { MetricResult, NextAction, WidgetSpec } from "@/lib/contracts";
import { presentCard, type CardExtras, type CardParts, type SortBy } from "@/lib/cards/present";

export type WidgetExtras = CardExtras & { actions?: NextAction[]; sortBy?: SortBy | null };

const NO_EXTRAS: WidgetExtras = {};

/** A widget and the rows it resolved to, as the card `presentCard` decides, so the dashboard and the chat draw the same card. */
export function widgetCard(widget: WidgetSpec, result: MetricResult, extras: WidgetExtras = NO_EXTRAS): CardParts {
  return presentCard({
    title: widget.title,
    query: widget.query,
    result,
    view: widget.kind,
    sortBy: extras.sortBy ?? null,
    extras,
    actions: extras.actions,
  });
}
