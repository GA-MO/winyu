import type { Dim, DimValues, Region } from "@/lib/contracts";
import type { Dictionary } from "./dictionary";

/** Geography from coarse to fine: a slice filtered at one level already sits inside every coarser one. */
export const GEO_LEVELS: readonly Dim[] = ["region", "province", "agent"];

type GeoScope = Partial<Record<Dim, string>>;

function provinceOfAgent(dictionary: Dictionary, agentId: string): string | null {
  return dictionary.master.agents.find((agent) => agent.id === agentId)?.provinceId ?? null;
}

/** The value a scope has at a geo level, stated or implied by a finer level: an agent implies its province and region. */
export function geoValueOf(dictionary: Dictionary, scope: GeoScope, level: Dim): string | null {
  const stated = scope[level];
  if (stated) return stated;
  if (level === "province") return scope.agent ? provinceOfAgent(dictionary, scope.agent) : null;
  if (level !== "region") return null;
  const province = geoValueOf(dictionary, scope, "province");
  return province ? dictionary.regionOf("province", province) : null;
}

/** The finest geo level a scope is pinned to, or -1 when it covers the whole country. */
export function finestGeoLevel(scope: GeoScope): number {
  return GEO_LEVELS.reduce((finest, level, index) => (scope[level] ? index : finest), -1);
}

const PLACE_DIMS: readonly Dim[] = ["region", "province", "agent", "dc", "plant"];

/** The region a slice of ids sits in: its region, else the region of the province, agent, DC or plant it names; null for the whole country. */
export function regionOfSlice(dictionary: Dictionary, slice: GeoScope): Region | null {
  for (const dim of PLACE_DIMS) {
    const id = slice[dim];
    const region = id ? dictionary.regionOf(dim, id) : null;
    if (region) return region;
  }
  return null;
}

function sharedGeoLevel(dims: GeoScope, dim: Dim): Dim | null {
  const finest = GEO_LEVELS.findLast((level) => dims[level]) ?? null;
  if (!finest) return null;
  return GEO_LEVELS.indexOf(finest) < GEO_LEVELS.indexOf(dim) ? finest : dim;
}

function coversDim(dictionary: Dictionary, dims: GeoScope, dim: Dim, ids: readonly string[]): boolean {
  if (!GEO_LEVELS.includes(dim)) {
    const value = dims[dim];
    return !value || ids.includes(value);
  }
  const level = sharedGeoLevel(dims, dim);
  if (!level) return false;
  const value = geoValueOf(dictionary, dims, level);
  return ids.some((id) => geoValueOf(dictionary, { [dim]: id }, level) === value);
}

/** True when something scoped by `dims` (an alert) concerns a slice of ids: a place compares at the coarser of the two levels, so an agent sits inside its province and region; a dimension it does not name never excludes it. */
export function sliceCovers(dictionary: Dictionary, slice: DimValues, dims: GeoScope): boolean {
  return (Object.entries(slice) as [Dim, string[] | undefined][]).every(([dim, ids]) => !ids || ids.length === 0 || coversDim(dictionary, dims, dim, ids));
}
