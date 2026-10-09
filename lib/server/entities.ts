import type { AccessContext, Dim } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { loadDictionary } from "./master-data";
import { ports } from "./ports";
import type { EntityDescription, EntityKind } from "./ports/metrics";

const PERMISSION_DENIED = "PERMISSION_DENIED";
const REGIONAL: Partial<Record<EntityKind, Dim>> = { agent: "agent", dc: "dc" };
const BRANDED: Partial<Record<EntityKind, Dim>> = { sku: "sku" };

export type ScopedDescription = EntityDescription | { ok: false; code: typeof PERMISSION_DENIED; error: string };

function idOf(described: Extract<EntityDescription, { ok: true }>): string | null {
  return typeof described.data.id === "string" ? described.data.id : null;
}

function inScope(allowed: readonly string[] | "all", value: string | null): boolean {
  return allowed === "all" || (value !== null && allowed.includes(value));
}

/** One master-data record from the warehouse's lookup, kept only when it sits in the caller's regions (agents, DCs) and brands (SKUs); a record Winyu cannot place is refused, never shown. */
export async function describeInScope(access: AccessContext, kind: EntityKind, query: string): Promise<ScopedDescription> {
  const described = await ports().metrics.describeEntity(kind, query);
  const regional = REGIONAL[kind];
  const branded = BRANDED[kind];
  if (!described.ok || (!regional && !branded)) return described;
  const id = idOf(described);
  const dictionary = await loadDictionary();
  const regionOk = !regional || inScope(access.regions, id ? dictionary.regionOf(regional, id) : null);
  const brandOk = !branded || inScope(access.brands, id ? dictionary.brandOf(branded, id) : null);
  if (regionOk && brandOk) return described;
  return { ok: false, code: PERMISSION_DENIED, error: TH.entities.outOfScope(id ? dictionary.entityLabel(kind, id) : query) };
}
