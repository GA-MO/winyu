import type { MetricResult, NextAction, WidgetSpec } from "@/lib/contracts";
import type { Spec, SpecElement } from "vexa/protocol";
import { TH } from "@/lib/i18n/th";
import { presentCard, type CardBody, type CardExtras, type CardParts, type SortBy } from "@/lib/cards/present";

type Elements = Record<string, SpecElement>;

export type WidgetExtras = CardExtras & { actions?: NextAction[]; sortBy?: SortBy | null };

const NO_EXTRAS: WidgetExtras = {};

function element(type: string, props: Record<string, unknown>, children: string[] = []): SpecElement {
  return { type, props, children } as SpecElement;
}

function bodyElements(id: string, body: CardBody): Elements {
  if (body.kind === "rank") return { [id]: element("RankList", { items: body.rows, showRank: body.showRank }) };
  if (body.kind === "progress") return { [id]: element("Progress", { label: body.label, value: body.value, detail: body.detail }) };
  if (body.kind === "line") {
    return {
      [id]: element("LineChart", {
        title: null,
        labels: body.labels,
        series: body.series,
        area: body.series.length === 1,
        showDots: false,
        format: body.format,
        height: "md",
      }),
    };
  }
  if (body.kind === "table") return { [id]: element("Table", { columns: body.columns, rows: body.rows }) };
  if (body.kind === "alerts") return { [id]: element("SignalList", { items: body.items }) };
  if (body.kind === "stacked" || body.kind === "share" || body.kind === "heatmap" || body.kind === "scatter" || body.kind === "gap" || body.kind === "funnel" || body.kind === "forecast") {
    return { [id]: element("CardBody", { body }) };
  }
  return {};
}

function actionElements(id: string, actions: NextAction[]): Elements {
  if (actions.length === 0) return {};
  return { [id]: element("ActionStrip", { actions }) };
}

function deniedSpec(widget: WidgetSpec, title: string, message: string): Spec {
  const root = `${widget.id}-root`;
  return {
    root,
    elements: {
      [root]: element("Card", { title, description: null, meta: null, footnote: null }, [`${widget.id}-denied`]),
      [`${widget.id}-denied`]: element("Alert", { title: TH.dash.denied, body: message, tone: "warning", meta: null }),
    },
  };
}

function specOf(widget: WidgetSpec, parts: CardParts): Spec {
  if (parts.denied) return deniedSpec(widget, parts.title, parts.denied);
  const root = `${widget.id}-root`;
  const heroId = `${widget.id}-hero`;
  const bodyId = `${widget.id}-body`;
  const actionsId = `${widget.id}-actions`;
  const body = bodyElements(bodyId, parts.body);
  const actions = actionElements(actionsId, parts.actions);
  const children = [
    ...(parts.hero ? [heroId] : []),
    ...(body[bodyId] ? [bodyId] : []),
    ...(actions[actionsId] ? [actionsId] : []),
  ];
  return {
    root,
    elements: {
      [root]: element("Card", { title: parts.title, description: parts.description, meta: parts.meta, footnote: parts.footnote }, children),
      ...(parts.hero ? { [heroId]: element("Metric", { ...parts.hero, size: "lg" }) } : {}),
      ...body,
      ...actions,
    },
  };
}

/** A widget and the rows it resolved to, as a Vexa spec. The shape comes from `presentCard`, so the chat renders the same card. */
export function widgetToSpec(widget: WidgetSpec, result: MetricResult, extras: WidgetExtras = NO_EXTRAS): Spec {
  return specOf(
    widget,
    presentCard({
      title: widget.title,
      query: widget.query,
      result,
      view: widget.kind,
      sortBy: extras.sortBy ?? null,
      extras,
      actions: extras.actions,
    }),
  );
}
