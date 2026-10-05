import type { Brand, Region } from "@/lib/contracts";
import type { ChannelId } from "./channels";

export type Campaign = {
  id: string; nameTh: string; label: string; from: string; to: string;
  brands: Brand[]; regions: Region[] | "all"; channels: ChannelId[] | "all";
  spendThb: number; upliftTarget: number; ownerUserId: string;
};
export type Competitor = { id: string; nameTh: string; baseShare: number };

export const CAMPAIGNS: readonly Campaign[] = [
  {
    id: "cmp_songkran_2025", nameTh: "สงกรานต์ 2568 สิงห์-ลีโอ", label: "Songkran 2025",
    from: "2025-04-05", to: "2025-04-20", brands: ["singha", "leo"], regions: "all", channels: "all",
    spendThb: 42_000_000, upliftTarget: 0.22, ownerUserId: "u_fah",
  },
  {
    id: "cmp_leo_music_2025", nameTh: "ลีโอ มิวสิค เฟสติวัล", label: "Leo Music Festival",
    from: "2025-06-01", to: "2025-08-31", brands: ["leo"], regions: ["northeast", "north", "east"], channels: ["on_premise", "traditional_trade"],
    spendThb: 28_000_000, upliftTarget: 0.14, ownerUserId: "u_fah",
  },
  {
    id: "cmp_loykrathong_2025", nameTh: "ลอยกระทง 2568", label: "Loy Krathong 2025",
    from: "2025-10-25", to: "2025-11-10", brands: ["singha", "leo", "singha_soda"], regions: "all", channels: "all",
    spendThb: 18_000_000, upliftTarget: 0.12, ownerUserId: "u_ben",
  },
  {
    id: "cmp_yearend_2025", nameTh: "ส่งท้ายปีเก่า 2568", label: "Year-end 2025",
    from: "2025-12-01", to: "2026-01-05", brands: ["singha", "leo", "singha_soda", "asahi", "carlsberg"], regions: "all", channels: "all",
    spendThb: 36_000_000, upliftTarget: 0.19, ownerUserId: "u_fah",
  },
  {
    id: "cmp_purra_clean_air", nameTh: "เพอร์ร่า อากาศสะอาด ภาคเหนือ", label: "Purra clean air north",
    from: "2026-01-15", to: "2026-04-15", brands: ["purra", "singha_water"], regions: ["north"], channels: ["modern_trade", "traditional_trade"],
    spendThb: 12_000_000, upliftTarget: 0.16, ownerUserId: "u_ben",
  },
  {
    id: "cmp_soda_summer_2026", nameTh: "โซดาสิงห์ ซัมเมอร์ 2569", label: "Singha Soda summer 2026",
    from: "2026-03-01", to: "2026-05-31", brands: ["singha_soda", "singha_lemon_soda"], regions: "all", channels: "all",
    spendThb: 22_000_000, upliftTarget: 0.18, ownerUserId: "u_ben",
  },
  {
    id: "cmp_songkran_2026", nameTh: "สงกรานต์ 2569 สิงห์-ลีโอ", label: "Songkran 2026",
    from: "2026-04-04", to: "2026-04-20", brands: ["singha", "leo"], regions: "all", channels: "all",
    spendThb: 45_000_000, upliftTarget: 0.24, ownerUserId: "u_fah",
  },
  {
    id: "cmp_cstore_soda_promo", nameTh: "ซีสโตร์ โซดาซัมเมอร์ 1 แถม 1", label: "C-Store soda promo",
    from: "2026-09-05", to: "2026-09-22", brands: ["singha_soda"], regions: ["bkk", "central"], channels: ["modern_trade"],
    spendThb: 8_000_000, upliftTarget: 0.35, ownerUserId: "u_pim",
  },
];

export const CAMPAIGN_INDEX: ReadonlyMap<string, number> = new Map(CAMPAIGNS.map((campaign, index) => [campaign.id, index]));

export function campaignById(id: string): Campaign | null {
  const index = CAMPAIGN_INDEX.get(id);
  return index === undefined ? null : (CAMPAIGNS[index] as Campaign);
}

export const COMPETITORS: readonly Competitor[] = [
  { id: "comp_a", nameTh: "คู่แข่ง A", baseShare: 0.21 },
  { id: "comp_b", nameTh: "คู่แข่ง B", baseShare: 0.11 },
  { id: "comp_c", nameTh: "คู่แข่ง C", baseShare: 0.06 },
];

/** Baseline weekly share of voice per brand before campaign lift; the remainder belongs to COMPETITORS. */
export const BRAND_BASE_SOV: Record<Brand, number> = {
  singha: 0.19,
  leo: 0.17,
  singha_soda: 0.08,
  singha_water: 0.06,
  purra: 0.04,
  singha_lemon_soda: 0.03,
  asahi: 0.03,
  carlsberg: 0.02,
};
