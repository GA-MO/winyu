import type { GrantSlice } from "@/lib/contracts";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { brandInfo } from "@/lib/data/entities/products";
import { formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";

/** A grant's slice as people read it: the metric's Thai name, its regions and its brands. */
export function sliceLabel(slice: GrantSlice): string {
  const regions = slice.regions === "all" ? TH.grant.allRegions : slice.regions.map((region) => TH.region[region]).join(", ");
  const brands = slice.brands === "all" ? TH.grant.allBrands : slice.brands.map((brand) => brandInfo(brand).nameTh).join(", ");
  return TH.grant.slice(metricLabel(slice.metric), regions, brands);
}

/** The Thai date a grant ends on. */
export function untilLabel(expiresAt: string): string {
  return formatDateTh(expiresAt);
}
