import type { Dim, Region } from "@/lib/contracts";
import { REGIONS } from "@/lib/contracts";
import { agentById } from "./agents";
import { PROVINCES } from "./org";

/** Geography from coarse to fine: a slice filtered at one level already sits inside every coarser one. */
export const GEO_LEVELS: readonly Dim[] = ["region", "province", "agent"];

type GeoScope = Partial<Record<Dim, string>>;

function provinceOfAgent(agentId: string): string | null {
  return agentById(agentId)?.provinceId ?? null;
}

function regionOfProvince(provinceId: string): Region | null {
  return PROVINCES.find((province) => province.id === provinceId)?.region ?? null;
}

/** The value a scope has at a geo level, stated or implied by a finer level: an agent implies its province and region. */
export function geoValueOf(scope: GeoScope, level: Dim): string | null {
  const stated = scope[level];
  if (stated) return stated;
  if (level === "province") return scope.agent ? provinceOfAgent(scope.agent) : null;
  if (level !== "region") return null;
  const province = geoValueOf(scope, "province");
  const region = province ? regionOfProvince(province) : null;
  return region && REGIONS.includes(region) ? region : null;
}

/** The finest geo level a scope is pinned to, or -1 when it covers the whole country. */
export function finestGeoLevel(scope: GeoScope): number {
  return GEO_LEVELS.reduce((finest, level, index) => (scope[level] ? index : finest), -1);
}
