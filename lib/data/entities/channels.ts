import type { Region } from "@/lib/contracts";
import type { Pack } from "./products";

export type ChannelId = "on_premise" | "modern_trade" | "traditional_trade" | "export";
export type ChannelInfo = { id: ChannelId; nameTh: string; label: string; share: number };
export type ModernTradeChain = { id: string; nameTh: string; label: string; storeCount: number; regions: Region[] };

export const CHANNELS: readonly ChannelInfo[] = [
  { id: "on_premise", nameTh: "ร้านอาหารและสถานบันเทิง", label: "On-premise", share: 0.28 },
  { id: "modern_trade", nameTh: "โมเดิร์นเทรด", label: "Modern trade", share: 0.31 },
  { id: "traditional_trade", nameTh: "ร้านค้าปลีกดั้งเดิม", label: "Traditional trade", share: 0.35 },
  { id: "export", nameTh: "ส่งออก", label: "Export", share: 0.06 },
];

export const CHANNEL_IDS = CHANNELS.map((channel) => channel.id);
export const CHANNEL_INDEX: ReadonlyMap<string, number> = new Map(CHANNELS.map((channel, index) => [channel.id, index]));

export const MODERN_TRADE_CHAINS: readonly ModernTradeChain[] = [
  { id: "chain_cstore", nameTh: "ซีสโตร์", label: "C-Store", storeCount: 1420, regions: ["bkk", "central", "east", "northeast", "north", "south"] },
  { id: "chain_bigvalue", nameTh: "บิ๊กแวลู", label: "Big Value", storeCount: 186, regions: ["bkk", "central", "northeast"] },
  { id: "chain_martone", nameTh: "มาร์ทวัน", label: "Mart One", storeCount: 312, regions: ["bkk", "east", "south"] },
  { id: "chain_greenfresh", nameTh: "กรีนเฟรช", label: "Green Fresh", storeCount: 94, regions: ["bkk", "north"] },
  { id: "chain_dailyplus", nameTh: "เดลี่พลัส", label: "Daily Plus", storeCount: 540, regions: ["central", "northeast", "east"] },
];

export function chainById(id: string): ModernTradeChain | null {
  return MODERN_TRADE_CHAINS.find((chain) => chain.id === id) ?? null;
}

/** Relative pull of a pack through each channel, before per-agent weighting. */
export const PACK_CHANNEL_AFFINITY: Record<Pack, Record<ChannelId, number>> = {
  bottle620: { on_premise: 1.5, modern_trade: 0.7, traditional_trade: 1.3, export: 0.6 },
  bottle320: { on_premise: 1.3, modern_trade: 0.9, traditional_trade: 1.1, export: 0.7 },
  can320: { on_premise: 0.8, modern_trade: 1.6, traditional_trade: 0.9, export: 1.4 },
  can490: { on_premise: 0.7, modern_trade: 1.5, traditional_trade: 0.8, export: 1.2 },
  keg30: { on_premise: 3.2, modern_trade: 0.05, traditional_trade: 0.1, export: 0.2 },
  pet600: { on_premise: 0.6, modern_trade: 1.7, traditional_trade: 1.4, export: 0.5 },
  pet1500: { on_premise: 0.3, modern_trade: 1.8, traditional_trade: 1.3, export: 0.4 },
  pack12: { on_premise: 0.2, modern_trade: 2.1, traditional_trade: 0.7, export: 0.8 },
};
