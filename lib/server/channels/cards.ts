import type { CardBody, CardParts } from "@/lib/cards/present";
import { toolCardParts } from "@/lib/cards/tool-answers";
import { ROOT_ID, type ComposedComponent, type ComposedSurface } from "@/lib/compose/catalog";
import type { TurnCall } from "./turn";
import type { ChannelCard, ChannelRow } from "./types";

/** The rows a chat app card shows before it points to the web for the rest. */
export const CHANNEL_ROWS = 5;

const VALUE_SEPARATOR = " · ";
const PATH_SEPARATOR = "/";

function row(label: string, value: string, delta: string | null = null, tone: ChannelRow["tone"] = "neutral"): ChannelRow {
  return { label, value, delta, tone };
}

function rowsOfBody(body: CardBody): ChannelRow[] {
  switch (body.kind) {
    case "rank":
      return body.rows.map((rank) => row(rank.label, rank.value, rank.delta, rank.tone));
    case "table": {
      const [first, ...rest] = body.columns;
      if (!first) return [];
      return body.rows.map((cells) => row(cells[first.key] ?? "", rest.map((column) => cells[column.key]).filter(Boolean).join(VALUE_SEPARATOR)));
    }
    case "share":
      return body.slices.map((slice) => row(slice.label, `${slice.valueText} (${slice.shareText})`));
    case "gap":
      return body.rows.map((gap) => row(gap.label, gap.gapText, gap.detail, gap.tone));
    case "funnel":
      return body.stages.map((stage) => row(stage.label, stage.valueText, stage.dropText, stage.dropTone));
    case "alerts":
      return body.items.map((item) => row(`${item.name} · ${item.place}`, item.gap ?? item.numbers, item.gap ? item.numbers : null, item.gapTone));
    case "progress":
      return [row(body.detail, "")];
    default:
      return [];
  }
}

/** A bound card's parts (the same decision table the chat card draws) squeezed for a chat app: headline and change first, the first rows, the count left for the web. */
export function channelCardOfParts(parts: CardParts): ChannelCard {
  const rows = rowsOfBody(parts.body);
  const hero = parts.hero ? { label: parts.hero.label, value: parts.hero.value, delta: parts.hero.delta, detail: parts.hero.detail, tone: parts.hero.tone } : null;
  return { title: parts.title, meta: parts.meta, hero, rows: rows.slice(0, CHANNEL_ROWS), more: Math.max(0, rows.length - CHANNEL_ROWS), note: parts.footnote, denied: parts.denied?.body ?? null };
}

type Walk = { byId: Map<string, ComposedComponent>; model: Record<string, unknown> };

function segmentsOf(path: string): string[] {
  return path.split(PATH_SEPARATOR).filter(Boolean);
}

function valueAt(model: unknown, path: string): unknown {
  let current = model;
  for (const segment of segmentsOf(path)) {
    if (Array.isArray(current)) current = current[Number(segment)];
    else if (typeof current === "object" && current !== null) current = (current as Record<string, unknown>)[segment];
    else return undefined;
  }
  return current;
}

function absolute(path: string, base: string | null): string {
  return path.startsWith(PATH_SEPARATOR) || !base ? path : `${base}${PATH_SEPARATOR}${path}`;
}

function bound(value: unknown, walk: Walk, base: string | null): unknown {
  if (typeof value === "object" && value !== null && !Array.isArray(value) && typeof (value as { path?: unknown }).path === "string") {
    return valueAt(walk.model, absolute((value as { path: string }).path, base));
  }
  return value;
}

function textOf(value: unknown, walk: Walk, base: string | null): string {
  const resolved = bound(value, walk, base);
  return typeof resolved === "string" || typeof resolved === "number" ? String(resolved) : "";
}

function listOf(value: unknown, walk: Walk, base: string | null): Record<string, unknown>[] {
  const resolved = bound(value, walk, base);
  return Array.isArray(resolved) ? resolved.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null) : [];
}

function cell(item: Record<string, unknown>, key: string): string {
  const value = item[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function childBases(children: unknown, walk: Walk, base: string | null): { id: string; base: string | null }[] {
  if (Array.isArray(children)) return children.filter((id): id is string => typeof id === "string").map((id) => ({ id, base }));
  if (typeof children !== "object" || children === null) return [];
  const { componentId, path } = children as { componentId?: unknown; path?: unknown };
  if (typeof componentId !== "string" || typeof path !== "string") return [];
  const listPath = absolute(path, base);
  const list = valueAt(walk.model, listPath);
  return Array.isArray(list) ? list.map((_, index) => ({ id: componentId, base: `${listPath}${PATH_SEPARATOR}${index}` })) : [];
}

function rowsOfComponent(id: string, walk: Walk, base: string | null): ChannelRow[] {
  const component = walk.byId.get(id);
  if (!component) return [];
  const text = (prop: string) => textOf(component[prop], walk, base);
  switch (component.component) {
    case "ListItem":
      return [row(text("title"), text("trailing") || text("subtitle"), text("detail") || null)];
    case "Person":
      return [row(text("name"), text("role"))];
    case "Metric":
      return [row(text("label"), text("value"), text("detail") || null)];
    case "Callout":
      return [row(text("title"), text("body"))];
    case "KeyValue": {
      const pairs = Array.isArray(component.pairs) ? (component.pairs as { label?: unknown; value?: unknown }[]) : [];
      const fromPairs = pairs.map((pair) => row(typeof pair.label === "string" ? pair.label : "", textOf(pair.value, walk, base)));
      const fromList = listOf(component.from, walk, base).map((pair) => row(cell(pair, "label"), cell(pair, "value")));
      return [...fromPairs, ...fromList];
    }
    case "Table": {
      const columns = Array.isArray(component.columns) ? (component.columns as { key: string }[]) : [];
      const [first, ...rest] = columns;
      if (!first) return [];
      return listOf(component.rows, walk, base).map((item) => row(cell(item, first.key), rest.map((column) => cell(item, column.key)).filter(Boolean).join(VALUE_SEPARATOR)));
    }
    case "RankList":
      return listOf(component.items, walk, base).map((item) => row(cell(item, String(component.label)), cell(item, String(component.value))));
    case "Card":
    case "Section":
    case "Grid":
    case "Carousel":
      return childBases(component.children, walk, base).flatMap((child) => rowsOfComponent(child.id, walk, child.base));
    default:
      return [];
  }
}

/** A composed card (the model's own A2UI layout, already checked against the turn's tool results) read as title and rows, its bindings resolved against the data it was sent with. */
export function channelCardOfSurface(surface: ComposedSurface): ChannelCard | null {
  const walk: Walk = { byId: new Map(surface.components.map((component) => [component.id, component])), model: surface.dataModel };
  const root = walk.byId.get(ROOT_ID) ?? surface.components[0];
  if (!root) return null;
  const rows = rowsOfComponent(root.id, walk, null).filter((line) => line.label || line.value);
  const title = root.component === "Card" ? textOf(root.title, walk, null) : "";
  const meta = root.component === "Card" ? textOf(root.meta, walk, null) || null : null;
  return { title, meta, hero: null, rows: rows.slice(0, CHANNEL_ROWS), more: Math.max(0, rows.length - CHANNEL_ROWS), note: null, denied: null };
}

/** Every card a turn drew, in the order the chat shows them: the bound cards of its tool results, then the composed cards. */
export function channelCardsOf(calls: readonly TurnCall[], composed: readonly ComposedSurface[]): ChannelCard[] {
  const bound = calls.flatMap((call) => {
    if (!call.done) return [];
    const parts = toolCardParts(call.tool, call.result, call.args);
    return parts ? [channelCardOfParts(parts)] : [];
  });
  const drawn = composed.flatMap((surface) => {
    const card = channelCardOfSurface(surface);
    return card ? [card] : [];
  });
  return [...bound, ...drawn];
}
