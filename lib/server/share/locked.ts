import { liveAccessFor } from "@/lib/access/enforce";
import { grantedSlice, hiddenValues } from "@/lib/access/grants";
import { BRANDS, REGIONS, type Brand, type Dim, type Region, type User } from "@/lib/contracts";
import type { LockedRows } from "@/lib/cards/present";
import { isTimeDim } from "@/lib/cards/rows";
import { REGION_LABELS_TH } from "@/lib/data/entities/org";
import { brandInfo } from "@/lib/data/entities/products";
import type { SharedRead } from "@/lib/share/card";

/** The breakdowns a locked row can stand in for, each naming its hidden values in the dimension's own fixed order. */
const LOCKABLE: Partial<Record<Dim, (hidden: { regions: Region[]; brands: Brand[] }) => string[]>> = {
  region: (hidden) => REGIONS.filter((region) => hidden.regions.includes(region)).map((region) => REGION_LABELS_TH[region]),
  brand: (hidden) => BRANDS.filter((brand) => hidden.brands.includes(brand)).map((brand) => brandInfo(brand).nameTh),
};

function breakdownOf(read: SharedRead): Dim | null {
  const dims = Array.isArray(read.input.dims) ? read.input.dims.filter((dim): dim is Dim => typeof dim === "string") : [];
  if (dims.some(isTimeDim) || dims.length !== 1) return null;
  return dims[0];
}

/**
 * The rows of a shared query_metric breakdown by region or brand that the sender's scope covers and the viewer's does not, by name only.
 * Built from the two people's access alone: nothing is read as the sender, so no value, order or count from the sender's data can reach it.
 */
export function lockedRowsOf(read: SharedRead, sender: User, viewer: User, askHref: string | null, at = new Date()): LockedRows | null {
  if (read.tool !== "query_metric" || sender.id === viewer.id) return null;
  const dim = breakdownOf(read);
  const namesOf = dim ? LOCKABLE[dim] : undefined;
  const slice = grantedSlice(liveAccessFor(sender, at), read);
  if (!dim || !namesOf || !slice) return null;
  const labels = namesOf(hiddenValues(liveAccessFor(viewer, at), slice, at));
  return labels.length > 0 ? { dim, labels, askHref } : null;
}
