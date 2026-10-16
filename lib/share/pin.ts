import { sameInput, type CardOnScreen } from "./card";

const METRIC_READ = "query_metric";
const READ_KEYS = ["metric", "dims", "filters", "compare", "period", "range"] as const;

function listed(value: unknown): unknown {
  if (Array.isArray(value)) return [...value].map(String).sort();
  return value === undefined || value === null ? value : [String(value)];
}

/** What a query reads, apart from how many rows it lists and in what order: the metric, the breakdown, the slice (one value or a list alike), the comparison and the window; null for something that is not a query. */
function parsedQuery(input: unknown): unknown {
  if (typeof input !== "object" || input === null || !("metric" in input)) return null;
  const query = input as Record<string, unknown>;
  const filters = Object.fromEntries(Object.entries((query.filters ?? {}) as Record<string, unknown>).map(([dim, values]) => [dim, listed(values)]));
  return Object.fromEntries(READ_KEYS.map((key) => [key, key === "filters" ? filters : key === "dims" ? listed(query.dims) : query[key]]));
}

/** The card on screen a pin keeps: the latest whose first read asked what the pinned query asks (key order, a filter written as one value or a list, the row limit and the sort do not matter); null when none did. */
export function pinnedCard(cards: readonly CardOnScreen[], query: unknown): CardOnScreen | null {
  const pinned = parsedQuery(query);
  if (pinned === null) return null;
  const matching = cards.filter((card) => card.target.card.reads[0]?.tool === METRIC_READ && sameInput(parsedQuery(card.target.card.reads[0].input), pinned));
  return matching.at(-1) ?? null;
}

/** The question a pin reads its query with, as query_metric read it for the card: the one that drew the card it pins, else the question that asked for the pin. */
export function pinQuestion(cards: readonly CardOnScreen[], query: unknown, asking: string | null): string | null {
  return pinnedCard(cards, query)?.target.question ?? asking;
}
