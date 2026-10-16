import { dimSchema, metricIdSchema, type Dim, type MetricId } from "@/lib/contracts";
import { responsibleFor, type Responsible } from "@/lib/access/raci";
import { GENERATOR_DICTIONARY } from "@/lib/data/master";
import { regionOfSlice } from "@/lib/semantic/geo";
import type { SharedCard, SharedRead } from "@/lib/share/card";

function metricOf(read: SharedRead): MetricId | null {
  const parsed = metricIdSchema.safeParse(read.input.metric);
  return parsed.success ? parsed.data : null;
}

function singleValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  return Array.isArray(value) && value.length === 1 && typeof value[0] === "string" ? value[0] : null;
}

/** The places a stored read narrows to, as ids: the read keeps the words the model wrote, so each value goes through the dictionary here; a word it cannot place is left out. */
function placesOf(read: SharedRead): Partial<Record<Dim, string>> {
  const slice = read.input.filters ?? read.input.dims;
  if (typeof slice !== "object" || slice === null || Array.isArray(slice)) return {};
  const places: Partial<Record<Dim, string>> = {};
  for (const [key, value] of Object.entries(slice)) {
    const dim = dimSchema.safeParse(key);
    const place = singleValue(value);
    const id = dim.success && place ? GENERATOR_DICTIONARY.resolveDimValue(dim.data, place) : null;
    if (dim.success && id) places[dim.data] = id;
  }
  return places;
}

/** Who a card belongs to: the RACI owner of its first metric, in the region its reads narrow to (by region, or by the agent, province, DC or plant they name); null when no read names a metric. */
export function cardOwner(card: SharedCard): Responsible | null {
  const metric = card.reads.map(metricOf).find((found) => found !== null);
  if (!metric) return null;
  const region = card.reads.map((read) => regionOfSlice(GENERATOR_DICTIONARY, placesOf(read))).find((found) => found !== null) ?? null;
  return responsibleFor(metric, region);
}

/** Who a card most likely belongs to, never the sender themselves. */
export function suggestedRecipient(card: SharedCard, senderId: string): Responsible | null {
  const owner = cardOwner(card);
  return owner && owner.userId !== senderId ? owner : null;
}
