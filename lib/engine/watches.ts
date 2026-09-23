import type { Dim, MetricId } from "@/lib/contracts";
import { SHARE_SCAN, type ScanOptions } from "./stats";

export type Watch = {
  id: string;
  metric: MetricId;
  entityDims: Dim[];
  grain: "day" | "month";
  minLevel: number;
  lowThreshold: number | null;
  transform: "none" | "year_over_year";
  parent: string | null;
  scan?: ScanOptions;
};

export const LOOKBACK_DAYS = 126;
export const LOOKBACK_MONTHS = 18;
export const YEAR_MONTHS = 12;

export const WATCHES: readonly Watch[] = [
  { id: "sellin_agent_brand", metric: "net_sales_volume", entityDims: ["agent", "brand"], grain: "day", minLevel: 3, lowThreshold: null, transform: "none", parent: null },
  { id: "sellin_agent_sku", metric: "net_sales_volume", entityDims: ["agent", "brand", "sku"], grain: "day", minLevel: 4, lowThreshold: null, transform: "none", parent: "sellin_agent_brand" },
  { id: "sellin_region", metric: "net_sales_volume", entityDims: ["region"], grain: "day", minLevel: 0, lowThreshold: null, transform: "none", parent: null },
  { id: "sellout_sku_province", metric: "sell_out_volume", entityDims: ["sku", "province"], grain: "day", minLevel: 4, lowThreshold: null, transform: "none", parent: null },
  { id: "sellout_sku_channel_region", metric: "sell_out_volume", entityDims: ["sku", "channel", "region"], grain: "day", minLevel: 4, lowThreshold: null, transform: "none", parent: null },
  { id: "cover_dc_sku", metric: "days_of_cover", entityDims: ["dc", "sku"], grain: "day", minLevel: 0.5, lowThreshold: 10, transform: "none", parent: null },
  { id: "output_plant", metric: "production_output", entityDims: ["plant"], grain: "day", minLevel: 0, lowThreshold: null, transform: "none", parent: null },
  { id: "share_province", metric: "market_share", entityDims: ["province"], grain: "month", minLevel: 0, lowThreshold: null, transform: "none", parent: null, scan: SHARE_SCAN },
  { id: "ar_region", metric: "ar_overdue", entityDims: ["region"], grain: "month", minLevel: 0, lowThreshold: null, transform: "year_over_year", parent: null },
];

export function watchById(id: string): Watch | null {
  return WATCHES.find((watch) => watch.id === id) ?? null;
}

export function parentKeyOf(watch: Watch, dims: Partial<Record<Dim, string>>, parent: Watch): string {
  return parent.entityDims.map((dim) => dims[dim] ?? "").join("|");
}
