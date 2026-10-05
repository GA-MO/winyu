import { BUSINESS_UNITS, REGIONS, type MasterData } from "@/lib/contracts";
import { createDictionary, type Dictionary } from "@/lib/semantic/dictionary";
import { AGENTS } from "./entities/agents";
import { CHANNELS, MODERN_TRADE_CHAINS } from "./entities/channels";
import { DEPARTMENTS } from "./entities/hr";
import { CAMPAIGNS } from "./entities/marketing";
import { MAKERS, OWN_MAKER } from "./entities/market";
import { BUSINESS_UNIT_LABELS_TH, PROVINCES, REGION_LABELS_TH } from "./entities/org";
import { BRAND_INFO, PACKS, PACK_LABELS_TH, SKUS } from "./entities/products";
import { DISTRIBUTION_CENTERS, PLANTS } from "./entities/supply";

function named(entry: { id: string; nameTh: string; label: string }) {
  return { id: entry.id, nameTh: entry.nameTh, label: entry.label };
}

/** The demo tenant's dimension tables, cut down to the fields a warehouse adapter has to supply. */
export const GENERATOR_MASTER: MasterData = {
  regions: REGIONS.map((id) => ({ id, nameTh: REGION_LABELS_TH[id] })),
  businessUnits: BUSINESS_UNITS.map((id) => ({ id, nameTh: BUSINESS_UNIT_LABELS_TH[id] })),
  provinces: PROVINCES.map(({ id, nameTh, region }) => ({ id, nameTh, region })),
  agents: AGENTS.map(({ id, nameTh, provinceId, region, servingDc }) => ({ id, nameTh, provinceId, region, servingDc })),
  brands: BRAND_INFO.map(({ id, nameTh, label, nicknames, businessUnit }) => ({ id, nameTh, label, nicknames, businessUnit })),
  packs: PACKS.map((id) => ({ id, nameTh: PACK_LABELS_TH[id] })),
  skus: SKUS.map(({ id, nameTh, label, brand, pack }) => ({ id, nameTh, label, brand, pack })),
  dcs: DISTRIBUTION_CENTERS.map((dc) => ({ ...named(dc), region: dc.region })),
  plants: PLANTS.map((plant) => ({ ...named(plant), region: plant.region })),
  campaigns: CAMPAIGNS.map(named),
  departments: DEPARTMENTS.map((department) => ({ ...named(department), headcount: department.baseHeadcount })),
  channels: CHANNELS.map(named),
  chains: MODERN_TRADE_CHAINS.map(named),
  makers: MAKERS.map((maker) => ({ ...named(maker), nicknames: maker.nicknames })),
  ownMaker: OWN_MAKER,
};

/** The dictionary over the generator's master data: for the batch plane, scripts, the scripted mock model and tests. */
export const GENERATOR_DICTIONARY: Dictionary = createDictionary(GENERATOR_MASTER);
