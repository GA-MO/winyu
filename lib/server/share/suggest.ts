import { dimSchema, metricIdSchema, type Dim, type MetricId, type Region, type User } from "@/lib/contracts";
import { responsibleFor, type Responsible } from "@/lib/access/raci";
import { GENERATOR_DICTIONARY } from "@/lib/data/master";
import { findUser, USERS } from "@/lib/data/entities/users";
import { regionOfSlice } from "@/lib/semantic/geo";
import type { SharedCard, SharedRead } from "@/lib/share/card";
import type { MatterSuggestions } from "@/lib/share/matter-actions";

function metricOf(read: SharedRead): MetricId | null {
  const parsed = metricIdSchema.safeParse(read.input.metric);
  return parsed.success ? parsed.data : null;
}

function valuesOf(value: unknown): string[] {
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** Each place a stored read narrows to, as ids per dimension: the read keeps the words the model wrote, so each value goes through the dictionary here; a word it cannot place is left out. */
function placesOf(read: SharedRead): Partial<Record<Dim, string[]>> {
  const slice = read.input.filters ?? read.input.dims;
  if (typeof slice !== "object" || slice === null || Array.isArray(slice)) return {};
  const places: Partial<Record<Dim, string[]>> = {};
  for (const [key, value] of Object.entries(slice)) {
    const dim = dimSchema.safeParse(key);
    if (!dim.success) continue;
    const ids = valuesOf(value).flatMap((word) => GENERATOR_DICTIONARY.resolveDimValue(dim.data, word) ?? []);
    if (ids.length > 0) places[dim.data] = ids;
  }
  return places;
}

/** The one region every place a read names lies in (four agents of one region are that region); null when it names none or several regions. */
function regionOfRead(read: SharedRead): Region | null {
  const regions = new Set<Region>();
  for (const [dim, ids] of Object.entries(placesOf(read))) {
    for (const id of ids ?? []) {
      const region = regionOfSlice(GENERATOR_DICTIONARY, { [dim]: id });
      if (region) regions.add(region);
    }
  }
  const [only] = regions;
  return regions.size === 1 ? only : null;
}

function agentOfRead(read: SharedRead): string | null {
  const agents = placesOf(read).agent ?? [];
  return agents.length === 1 ? agents[0] : null;
}

/** What a card is about: the metric of its first metric read and the one region its reads narrow to (null where they name none, or several). */
export function cardSubject(card: SharedCard): { metric: MetricId | null; region: Region | null } {
  const metric = card.reads.map(metricOf).find((found) => found !== null) ?? null;
  const region = card.reads.map(regionOfRead).find((found) => found !== null) ?? null;
  return { metric, region };
}

/** Who a card belongs to: the RACI owner of its first metric, in the region its reads narrow to (by region, or by the agents, provinces, DCs or plants they name, however many when they share one region), else in the region of the person looking when their own role is regional; null when no read names a metric. */
export function cardOwner(card: SharedCard, lookerRegion: Region | null = null): Responsible | null {
  const subject = cardSubject(card);
  if (!subject.metric) return null;
  const metric = subject.metric;
  const region = subject.region ?? lookerRegion;
  const agent = card.reads.map(agentOfRead).find((found) => found !== null) ?? null;
  return responsibleFor(metric, region, agent);
}

/** Who a card most likely belongs to, never the person sending it. */
export function suggestedRecipient(card: SharedCard, senderId: string): Responsible | null {
  const owner = cardOwner(card, findUser(senderId)?.region ?? null);
  return owner && owner.userId !== senderId ? owner : null;
}

/** The person's own line: the people who report to them, their manager, then colleagues in their region. */
export function lineOf(person: User): string[] {
  const reports = USERS.filter((user) => user.managerId === person.id);
  const manager = person.managerId ? USERS.filter((user) => user.id === person.managerId) : [];
  const peers = person.region ? USERS.filter((user) => user.region === person.region) : [];
  return [...new Set([...reports, ...manager, ...peers].map((user) => user.id))].filter((id) => id !== person.id);
}

/** The card's owner first (preselected; never the sender), then the sender's own line, each person once; the rest of the directory comes after in the picker. */
export function suggestionsFor(card: SharedCard, senderId: string): MatterSuggestions {
  const sender = findUser(senderId);
  const ownerId = suggestedRecipient(card, senderId)?.userId ?? null;
  const line = sender ? lineOf(sender).filter((id) => id !== ownerId) : [];
  return { ownerId, line };
}
