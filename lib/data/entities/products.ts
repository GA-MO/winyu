import { BRANDS, type Brand, type BusinessUnit } from "@/lib/contracts";

export type Pack = "bottle620" | "bottle320" | "can320" | "can490" | "keg30" | "pet600" | "pet1500" | "pack12";
export type BrandInfo = { id: Brand; nameTh: string; label: string; businessUnit: BusinessUnit; nicknames: string[] };
export type Sku = {
  id: string; brand: Brand; pack: Pack; nameTh: string; label: string;
  hlPerCase: number; pricePerCase: number; excise: boolean;
};

export const PACKS = ["bottle620", "bottle320", "can320", "can490", "keg30", "pet600", "pet1500", "pack12"] as const satisfies readonly Pack[];

export const PACK_LABELS_TH: Record<Pack, string> = {
  bottle620: "ขวด 620 มล.",
  bottle320: "ขวด 320 มล.",
  can320: "กระป๋อง 320 มล.",
  can490: "กระป๋อง 490 มล.",
  keg30: "ถัง 30 ลิตร",
  pet600: "ขวด PET 600 มล.",
  pet1500: "ขวด PET 1.5 ลิตร",
  pack12: "แพ็ก 12",
};

const HL_PER_CASE: Record<Pack, number> = {
  bottle620: 0.0744,
  bottle320: 0.0768,
  can320: 0.0768,
  can490: 0.1176,
  keg30: 0.3,
  pet600: 0.072,
  pet1500: 0.09,
  pack12: 0.0768,
};

export const BRAND_INFO: readonly BrandInfo[] = [
  { id: "singha", nameTh: "สิงห์", label: "Singha", businessUnit: "beer", nicknames: ["เบียร์สิงห์", "สิงห์", "singha"] },
  { id: "leo", nameTh: "ลีโอ", label: "Leo", businessUnit: "beer", nicknames: ["ลีโอ", "เบียร์ลีโอ", "leo"] },
  { id: "singha_soda", nameTh: "โซดาสิงห์", label: "Singha Soda", businessUnit: "non_alcohol", nicknames: ["โซดาสิงห์", "โซดา", "singha soda"] },
  { id: "singha_water", nameTh: "น้ำดื่มสิงห์", label: "Singha Water", businessUnit: "non_alcohol", nicknames: ["น้ำสิงห์", "น้ำดื่มสิงห์", "singha water"] },
  { id: "purra", nameTh: "เพอร์ร่า", label: "Purra", businessUnit: "non_alcohol", nicknames: ["เพอร์ร่า", "เพอรา", "purra"] },
  { id: "singha_lemon_soda", nameTh: "สิงห์ เลมอนโซดา", label: "Singha Lemon Soda", businessUnit: "non_alcohol", nicknames: ["เลมอนโซดา", "สิงห์เลมอน", "lemon soda"] },
  { id: "asahi", nameTh: "อาซาฮี", label: "Asahi", businessUnit: "import", nicknames: ["อาซาฮี", "asahi"] },
  { id: "carlsberg", nameTh: "คาร์ลสเบิร์ก", label: "Carlsberg", businessUnit: "import", nicknames: ["คาร์ลสเบิร์ก", "คาลส์เบิร์ก", "carlsberg"] },
];

export const BRAND_INDEX: ReadonlyMap<Brand, number> = new Map(BRANDS.map((brand, index) => [brand, index]));
export const PACK_INDEX: ReadonlyMap<Pack, number> = new Map(PACKS.map((pack, index) => [pack, index]));

export function brandInfo(brand: Brand): BrandInfo {
  return BRAND_INFO[BRAND_INDEX.get(brand) ?? 0] as BrandInfo;
}

type SkuSeed = { brand: Brand; pack: Pack; pricePerCase: number };

const SKU_SEEDS: readonly SkuSeed[] = [
  { brand: "singha", pack: "bottle620", pricePerCase: 780 },
  { brand: "singha", pack: "bottle320", pricePerCase: 620 },
  { brand: "singha", pack: "can320", pricePerCase: 725 },
  { brand: "singha", pack: "can490", pricePerCase: 985 },
  { brand: "singha", pack: "keg30", pricePerCase: 2420 },
  { brand: "singha", pack: "pack12", pricePerCase: 765 },
  { brand: "leo", pack: "bottle620", pricePerCase: 690 },
  { brand: "leo", pack: "bottle320", pricePerCase: 545 },
  { brand: "leo", pack: "can320", pricePerCase: 655 },
  { brand: "leo", pack: "can490", pricePerCase: 890 },
  { brand: "leo", pack: "keg30", pricePerCase: 2180 },
  { brand: "leo", pack: "pack12", pricePerCase: 690 },
  { brand: "singha_soda", pack: "bottle320", pricePerCase: 188 },
  { brand: "singha_soda", pack: "can320", pricePerCase: 232 },
  { brand: "singha_soda", pack: "pack12", pricePerCase: 242 },
  { brand: "singha_water", pack: "pet600", pricePerCase: 78 },
  { brand: "singha_water", pack: "pet1500", pricePerCase: 96 },
  { brand: "singha_water", pack: "pack12", pricePerCase: 85 },
  { brand: "purra", pack: "pet600", pricePerCase: 142 },
  { brand: "purra", pack: "pet1500", pricePerCase: 176 },
  { brand: "purra", pack: "pack12", pricePerCase: 152 },
  { brand: "singha_lemon_soda", pack: "can320", pricePerCase: 258 },
  { brand: "singha_lemon_soda", pack: "bottle320", pricePerCase: 236 },
  { brand: "singha_lemon_soda", pack: "pet600", pricePerCase: 212 },
  { brand: "asahi", pack: "can320", pricePerCase: 905 },
  { brand: "asahi", pack: "bottle320", pricePerCase: 862 },
  { brand: "asahi", pack: "keg30", pricePerCase: 3120 },
  { brand: "carlsberg", pack: "can320", pricePerCase: 880 },
  { brand: "carlsberg", pack: "bottle620", pricePerCase: 945 },
  { brand: "carlsberg", pack: "keg30", pricePerCase: 3010 },
];

const EXCISE_UNITS: BusinessUnit[] = ["beer", "import"];

function buildSku(seed: SkuSeed): Sku {
  const info = brandInfo(seed.brand);
  return {
    id: `sku_${seed.brand}_${seed.pack}`,
    brand: seed.brand,
    pack: seed.pack,
    nameTh: `${info.nameTh} ${PACK_LABELS_TH[seed.pack]}`,
    label: `${info.label} ${seed.pack}`,
    hlPerCase: HL_PER_CASE[seed.pack],
    pricePerCase: seed.pricePerCase,
    excise: EXCISE_UNITS.includes(info.businessUnit),
  };
}

export const SKUS: readonly Sku[] = SKU_SEEDS.map(buildSku);
export const SKU_INDEX: ReadonlyMap<string, number> = new Map(SKUS.map((sku, index) => [sku.id, index]));

export function skuById(id: string): Sku | null {
  const index = SKU_INDEX.get(id);
  return index === undefined ? null : (SKUS[index] as Sku);
}

export function businessUnitOfBrand(brand: Brand): BusinessUnit {
  return brandInfo(brand).businessUnit;
}

export const BEER_BRANDS: readonly Brand[] = BRAND_INFO.filter((info) => info.businessUnit !== "non_alcohol").map((info) => info.id);
