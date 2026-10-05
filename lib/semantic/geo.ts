import type { Dim } from "@/lib/contracts";
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
