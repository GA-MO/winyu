import { BRANDS, REGIONS, type Brand, type Region } from "@/lib/contracts";
import { INJECTED_ANOMALIES, windowDays } from "./anomalies";
import {
  DAY_COUNT, DAY_OF_YEAR, DOW_OF_DAY, MONTH_COUNT, MONTH_OF_DAY, WEEK_COUNT, WEEK_OF_DAY, daysInMonthIndex, toDayIndex,
} from "./dates";
import { AGENTS } from "./entities/agents";
import { CHANNELS, CHANNEL_INDEX, PACK_CHANNEL_AFFINITY, type ChannelId } from "./entities/channels";
import { ALCOHOL_BAN_FLAGS, HOLIDAY_FLAGS, LENT_FLAGS, SONGKRAN_FLAGS } from "./entities/calendar";
import { BASELINE_TRADE_SPEND_RATIO, BU_BUDGET_INDEX, TARGET_GROWTH, TRADE_SPEND_BUDGET_INDEX } from "./entities/finance";
import { DEPARTMENTS } from "./entities/hr";
import { CAMPAIGNS } from "./entities/marketing";
import { BRAND_BASE_SOV, COMPETITORS } from "./entities/marketing";
import { BRAND_INDEX, BRAND_INFO, PACK_INDEX, SKUS, brandInfo } from "./entities/products";
import { BUSINESS_UNIT_INDEX, PROVINCE_INDEX, REGION_INDEX } from "./entities/org";
import { DISTRIBUTION_CENTERS, DC_INDEX, PLANTS, PLANT_BRAND_MIX, PRODUCTION_LINES } from "./entities/supply";
import { hashNoise, jitter } from "./random";

export const SKU_COUNT = SKUS.length;
export const AGENT_COUNT = AGENTS.length;
export const REGION_COUNT = REGIONS.length;
export const BRAND_COUNT = BRANDS.length;
export const CHANNEL_COUNT = CHANNELS.length;
export const DC_COUNT = DISTRIBUTION_CENTERS.length;
export const LINE_COUNT = PRODUCTION_LINES.length;
export const PLANT_COUNT = PLANTS.length;
export const CAMPAIGN_COUNT = CAMPAIGNS.length;
export const DEPARTMENT_COUNT = DEPARTMENTS.length;

const NATIONAL_BASE_CASES = 330;
const DAILY_TREND = 0.00018;
const CELL_NOISE_AMPLITUDE = 0.17;
const HOLIDAY_ORDER_FACTOR = 0.52;
const LENT_BEER_FACTOR = 0.82;
const SONGKRAN_BEER_FACTOR = 1.42;
const SONGKRAN_LEAD_DAYS = 9;
const SELL_OUT_SHRINK = 0.97;
const BAN_DAY_SELL_OUT = 0.1;
const BAN_EVE_SELL_OUT = 1.3;
const BAN_ORDER_FACTORS: readonly number[] = [0.15, 1.35, 1.15];
const SELL_OUT_LAGS = [3, 4, 5, 6, 7, 8, 9, 10];
const SELL_OUT_WEIGHTS = [0.06, 0.12, 0.18, 0.2, 0.17, 0.13, 0.09, 0.05];
const CONSUMER_DOW = [1.147, 0.836, 0.817, 0.855, 0.924, 1.118, 1.303];
const ORDER_DOW = [0.364, 1.165, 1.124, 1.092, 1.145, 1.3, 0.812];
const BEER_SEASON_AMPLITUDE = 0.3;
const BEER_SEASON_PEAK_DOY = 100;
const SOFT_SEASON_AMPLITUDE = 0.34;
const SOFT_SEASON_PEAK_DOY = 110;
const COVER_DAYS_WINDOW = 28;
const CHANNEL_DRIVEN_CAMPAIGNS = new Set(["cmp_cstore_soda_promo"]);

const BRAND_REGION_MIX: Record<Brand, Record<Region, number>> = {
  singha: { bkk: 1.15, central: 1.0, north: 0.9, northeast: 0.95, east: 1.05, south: 1.0 },
  leo: { bkk: 0.85, central: 1.0, north: 1.05, northeast: 1.35, east: 1.1, south: 0.95 },
  singha_soda: { bkk: 1.2, central: 1.0, north: 0.9, northeast: 1.05, east: 1.0, south: 0.95 },
  singha_water: { bkk: 1.1, central: 1.05, north: 1.0, northeast: 0.95, east: 1.0, south: 1.0 },
  purra: { bkk: 1.3, central: 1.0, north: 1.25, northeast: 0.7, east: 1.0, south: 0.85 },
  singha_lemon_soda: { bkk: 1.25, central: 1.05, north: 0.95, northeast: 0.9, east: 1.05, south: 0.9 },
  asahi: { bkk: 1.6, central: 0.8, north: 0.9, northeast: 0.5, east: 1.4, south: 1.2 },
  carlsberg: { bkk: 1.5, central: 0.85, north: 0.85, northeast: 0.55, east: 1.35, south: 1.25 },
};

const BRAND_SCALE: Record<Brand, number> = {
  singha: 1.0, leo: 1.15, singha_soda: 0.55, singha_water: 0.9,
  purra: 0.3, singha_lemon_soda: 0.22, asahi: 0.12, carlsberg: 0.1,
};

const PACK_SCALE: Record<string, number> = {
  bottle620: 1.0, bottle320: 0.55, can320: 0.8, can490: 0.35,
  keg30: 0.08, pet600: 1.4, pet1500: 0.8, pack12: 0.45,
};

export const SKU_BRAND_INDEX = new Int32Array(SKUS.map((sku) => BRAND_INDEX.get(sku.brand) ?? 0));
export const SKU_PACK_INDEX = new Int32Array(SKUS.map((sku) => PACK_INDEX.get(sku.pack) ?? 0));
export const SKU_BU_INDEX = new Int32Array(SKUS.map((sku) => BUSINESS_UNIT_INDEX.get(brandInfo(sku.brand).businessUnit) ?? 0));
export const SKU_HL_PER_CASE = new Float64Array(SKUS.map((sku) => sku.hlPerCase));
export const SKU_PRICE_PER_CASE = new Float64Array(SKUS.map((sku) => sku.pricePerCase));
export const AGENT_REGION_INDEX = new Int32Array(AGENTS.map((agent) => REGION_INDEX.get(agent.region) ?? 0));
export const AGENT_PROVINCE_INDEX = new Int32Array(AGENTS.map((agent) => PROVINCE_INDEX.get(agent.provinceId) ?? 0));
export const AGENT_DC_INDEX = new Int32Array(AGENTS.map((agent) => DC_INDEX.get(agent.servingDc) ?? 0));
export const BRAND_IS_BEER = new Uint8Array(BRAND_INFO.map((info) => (info.businessUnit === "non_alcohol" ? 0 : 1)));

export function cubeIndex(skuIdx: number, agentIdx: number, dayIdx: number): number {
  return (skuIdx * AGENT_COUNT + agentIdx) * DAY_COUNT + dayIdx;
}

function cellNoise(index: number): number {
  let hash = (index ^ 0x9e3779b9) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35) >>> 0;
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

function seasonFactor(brandIdx: number, dayIdx: number): number {
  const dayOfYear = DAY_OF_YEAR[dayIdx];
  if (BRAND_IS_BEER[brandIdx] === 1) {
    return 1 + BEER_SEASON_AMPLITUDE * Math.cos((2 * Math.PI * (dayOfYear - BEER_SEASON_PEAK_DOY)) / 365);
  }
  return 1 + SOFT_SEASON_AMPLITUDE * Math.cos((2 * Math.PI * (dayOfYear - SOFT_SEASON_PEAK_DOY)) / 365);
}

function songkranFactor(dayIdx: number): number {
  for (let offset = 0; offset <= SONGKRAN_LEAD_DAYS; offset += 1) {
    const ahead = dayIdx + offset;
    if (ahead < DAY_COUNT && SONGKRAN_FLAGS[ahead] === 1) return 1 + (SONGKRAN_BEER_FACTOR - 1) * (1 - offset / (SONGKRAN_LEAD_DAYS + 2));
  }
  return SONGKRAN_FLAGS[dayIdx] === 1 ? SONGKRAN_BEER_FACTOR : 1;
}

const ORDER_DAY_FACTOR = (() => {
  const table = new Float64Array(DAY_COUNT);
  for (let dayIdx = 0; dayIdx < DAY_COUNT; dayIdx += 1) {
    table[dayIdx] = ORDER_DOW[DOW_OF_DAY[dayIdx]] * (HOLIDAY_FLAGS[dayIdx] === 1 ? HOLIDAY_ORDER_FACTOR : 1);
  }
  return table;
})();

function banOffset(dayIdx: number): number {
  for (let offset = 0; offset < BAN_ORDER_FACTORS.length; offset += 1) {
    const ahead = dayIdx + offset;
    if (ahead < DAY_COUNT && ALCOHOL_BAN_FLAGS[ahead] === 1) return offset;
  }
  return -1;
}

const BEER_ORDER_BAN_FACTOR = (() => {
  const table = new Float64Array(DAY_COUNT).fill(1);
  for (let dayIdx = 0; dayIdx < DAY_COUNT; dayIdx += 1) {
    const offset = banOffset(dayIdx);
    if (offset >= 0) table[dayIdx] = BAN_ORDER_FACTORS[offset] as number;
  }
  return table;
})();

const BEER_SELL_OUT_BAN_FACTOR = (() => {
  const table = new Float64Array(DAY_COUNT).fill(1);
  for (let dayIdx = 0; dayIdx < DAY_COUNT; dayIdx += 1) {
    if (ALCOHOL_BAN_FLAGS[dayIdx] === 1) table[dayIdx] = BAN_DAY_SELL_OUT;
    else if (dayIdx + 1 < DAY_COUNT && ALCOHOL_BAN_FLAGS[dayIdx + 1] === 1) table[dayIdx] = BAN_EVE_SELL_OUT;
  }
  return table;
})();

function buildBrandDayFactor(): Float64Array {
  const table = new Float64Array(BRAND_COUNT * DAY_COUNT);
  for (let brandIdx = 0; brandIdx < BRAND_COUNT; brandIdx += 1) {
    const isBeer = BRAND_IS_BEER[brandIdx] === 1;
    for (let dayIdx = 0; dayIdx < DAY_COUNT; dayIdx += 1) {
      let factor = seasonFactor(brandIdx, dayIdx) * (1 + DAILY_TREND * dayIdx);
      if (isBeer) {
        if (LENT_FLAGS[dayIdx] === 1) factor *= LENT_BEER_FACTOR;
        factor *= songkranFactor(dayIdx);
      }
      table[brandIdx * DAY_COUNT + dayIdx] = factor;
    }
  }
  return table;
}

function campaignChannelCoverage(campaign: (typeof CAMPAIGNS)[number]): number {
  if (campaign.channels === "all") return 1;
  let coverage = 0;
  for (const channel of campaign.channels) coverage += CHANNELS[CHANNEL_INDEX.get(channel) ?? 0].share;
  return coverage;
}

function rampWeight(position: number, length: number): number {
  const progress = length <= 1 ? 1 : position / (length - 1);
  if (progress < 0.2) return progress / 0.2;
  if (progress > 0.85) return (1 - progress) / 0.15;
  return 1;
}

function buildPromoFactor(): Float64Array {
  const table = new Float64Array(BRAND_COUNT * REGION_COUNT * DAY_COUNT).fill(1);
  for (const campaign of CAMPAIGNS) {
    if (CHANNEL_DRIVEN_CAMPAIGNS.has(campaign.id)) continue;
    const from = Math.max(0, toDayIndex(campaign.from));
    const to = Math.min(DAY_COUNT - 1, toDayIndex(campaign.to));
    if (to < from) continue;
    const coverage = campaignChannelCoverage(campaign);
    const regions = campaign.regions === "all" ? REGIONS : campaign.regions;
    for (const brand of campaign.brands) {
      const brandIdx = BRAND_INDEX.get(brand) ?? 0;
      for (const region of regions) {
        const regionIdx = REGION_INDEX.get(region) ?? 0;
        const offset = (brandIdx * REGION_COUNT + regionIdx) * DAY_COUNT;
        for (let dayIdx = from; dayIdx <= to; dayIdx += 1) {
          const weight = rampWeight(dayIdx - from, to - from + 1);
          const local = jitter(0.12, campaign.id, region, dayIdx);
          table[offset + dayIdx] *= 1 + campaign.upliftTarget * coverage * weight * local;
        }
      }
    }
  }
  return table;
}

function buildChannelMix(): Float64Array {
  const table = new Float64Array(AGENT_COUNT * SKU_COUNT * CHANNEL_COUNT);
  const exportAgents = new Set(["ag_bkk_01", "ag_bkk_07", "ag_est_01", "ag_est_03", "ag_sou_01", "ag_sou_03"]);
  for (let agentIdx = 0; agentIdx < AGENT_COUNT; agentIdx += 1) {
    const agent = AGENTS[agentIdx];
    const agentBase = CHANNELS.map((channel) => {
      const exportScale = channel.id === "export" ? (exportAgents.has(agent.id) ? 2.6 : 0.12) : 1;
      return channel.share * exportScale * jitter(0.3, "channel", agent.id, channel.id);
    });
    for (let skuIdx = 0; skuIdx < SKU_COUNT; skuIdx += 1) {
      const affinity = PACK_CHANNEL_AFFINITY[SKUS[skuIdx].pack];
      let total = 0;
      const raw = CHANNELS.map((channel, channelIdx) => {
        const value = agentBase[channelIdx] * affinity[channel.id];
        total += value;
        return value;
      });
      const offset = (agentIdx * SKU_COUNT + skuIdx) * CHANNEL_COUNT;
      for (let channelIdx = 0; channelIdx < CHANNEL_COUNT; channelIdx += 1) table[offset + channelIdx] = raw[channelIdx] / total;
    }
  }
  return table;
}

export const CHANNEL_MIX = buildChannelMix();

const CHAIN_PROMO = (() => {
  const anomaly = INJECTED_ANOMALIES.find((entry) => entry.id === "anom_cstore_soda_promo");
  if (!anomaly) return null;
  const skuIdx = SKUS.findIndex((sku) => sku.id === anomaly.dims.sku);
  const regionIndices = new Set((anomaly.extraDims.regions ?? "").split(",").map((region) => REGION_INDEX.get(region as Region) ?? -1));
  const channelIdx = CHANNEL_INDEX.get(anomaly.dims.channel as ChannelId) ?? 1;
  const boost = anomaly.effect.kind === "multiplier" ? anomaly.effect.value : 1;
  return { skuIdx, regionIndices, channelIdx, boost, ...windowDays(anomaly) };
})();

function chainPromoApplies(skuIdx: number, agentIdx: number, dayIdx: number): boolean {
  if (!CHAIN_PROMO) return false;
  if (skuIdx !== CHAIN_PROMO.skuIdx) return false;
  if (dayIdx < CHAIN_PROMO.from || dayIdx > CHAIN_PROMO.to) return false;
  return CHAIN_PROMO.regionIndices.has(AGENT_REGION_INDEX[agentIdx]);
}

/** Multiplier applied to the whole cell because one channel is promoted. */
export function channelBoost(skuIdx: number, agentIdx: number, dayIdx: number): number {
  if (!CHAIN_PROMO || !chainPromoApplies(skuIdx, agentIdx, dayIdx)) return 1;
  const mix = CHANNEL_MIX[(agentIdx * SKU_COUNT + skuIdx) * CHANNEL_COUNT + CHAIN_PROMO.channelIdx];
  return 1 + mix * (CHAIN_PROMO.boost - 1);
}

/** Share of a cell that belongs to one channel, after channel-level promotions. */
export function channelShare(skuIdx: number, agentIdx: number, dayIdx: number, channelIdx: number): number {
  const mix = CHANNEL_MIX[(agentIdx * SKU_COUNT + skuIdx) * CHANNEL_COUNT + channelIdx];
  if (!CHAIN_PROMO || !chainPromoApplies(skuIdx, agentIdx, dayIdx)) return mix;
  const boosted = channelIdx === CHAIN_PROMO.channelIdx ? mix * CHAIN_PROMO.boost : mix;
  return boosted / channelBoost(skuIdx, agentIdx, dayIdx);
}

type CellRule = { skus: Set<number> | null; agents: Set<number> | null; from: number; to: number; multiplier: number };

function indicesOf<T extends { id: string }>(list: readonly T[], ids: string[]): Set<number> {
  const set = new Set<number>();
  ids.forEach((id) => {
    const index = list.findIndex((entry) => entry.id === id);
    if (index >= 0) set.add(index);
  });
  return set;
}

function skusOfBrands(brands: string[]): Set<number> {
  const set = new Set<number>();
  SKUS.forEach((sku, index) => {
    if (brands.includes(sku.brand)) set.add(index);
  });
  return set;
}

function agentsOfProvinces(provinceIds: string[]): Set<number> {
  const set = new Set<number>();
  AGENTS.forEach((agent, index) => {
    if (provinceIds.includes(agent.provinceId)) set.add(index);
  });
  return set;
}

function buildCellRules(): { sellIn: CellRule[]; sellOut: CellRule[] } {
  const sellIn: CellRule[] = [];
  const sellOut: CellRule[] = [];
  for (const anomaly of INJECTED_ANOMALIES) {
    if (anomaly.effect.kind !== "multiplier") continue;
    const window = windowDays(anomaly);
    const rule = { from: window.from, to: window.to, multiplier: anomaly.effect.value };
    if (anomaly.id === "anom_rungrueang_leo620") {
      sellIn.push({ ...rule, skus: indicesOf(SKUS, [anomaly.dims.sku as string]), agents: indicesOf(AGENTS, [anomaly.dims.agent as string]) });
    }
    if (anomaly.id === "anom_northeast_silent_agents") {
      sellIn.push({
        ...rule,
        skus: skusOfBrands((anomaly.extraDims.brands ?? "").split(",")),
        agents: indicesOf(AGENTS, (anomaly.extraDims.agents ?? "").split(",")),
      });
    }
    if (anomaly.id === "anom_purra_pm25_north") {
      sellOut.push({
        ...rule,
        skus: indicesOf(SKUS, [anomaly.dims.sku as string]),
        agents: agentsOfProvinces((anomaly.extraDims.provinces ?? "").split(",")),
      });
    }
  }
  return { sellIn, sellOut };
}

const CELL_RULES = buildCellRules();

function rulesFor(rules: CellRule[], skuIdx: number, agentIdx: number): CellRule[] {
  return rules.filter((rule) => (!rule.skus || rule.skus.has(skuIdx)) && (!rule.agents || rule.agents.has(agentIdx)));
}

export type SalesCube = {
  sellInCases: Float64Array;
  sellOutCases: Float64Array;
  targetCases: Float64Array;
};

export function buildSalesCube(): SalesCube {
  const brandDay = buildBrandDayFactor();
  const promo = buildPromoFactor();
  const cells = SKU_COUNT * AGENT_COUNT * DAY_COUNT;
  const base = new Float64Array(cells);
  const sellOutCases = new Float64Array(cells);

  for (let skuIdx = 0; skuIdx < SKU_COUNT; skuIdx += 1) {
    const sku = SKUS[skuIdx];
    const brandIdx = SKU_BRAND_INDEX[skuIdx];
    const skuBase = NATIONAL_BASE_CASES * BRAND_SCALE[sku.brand] * PACK_SCALE[sku.pack];
    const brandOffset = brandIdx * DAY_COUNT;
    for (let agentIdx = 0; agentIdx < AGENT_COUNT; agentIdx += 1) {
      const agent = AGENTS[agentIdx];
      const regionIdx = AGENT_REGION_INDEX[agentIdx];
      const affinity = jitter(0.14, "affinity", sku.id, agent.id);
      const cellBase = skuBase * agent.weight * BRAND_REGION_MIX[sku.brand][agent.region] * affinity;
      const promoOffset = (brandIdx * REGION_COUNT + regionIdx) * DAY_COUNT;
      const start = cubeIndex(skuIdx, agentIdx, 0);
      for (let dayIdx = 0; dayIdx < DAY_COUNT; dayIdx += 1) {
        const index = start + dayIdx;
        const noise = 1 + (cellNoise(index) - 0.5) * 2 * CELL_NOISE_AMPLITUDE;
        base[index] = cellBase * brandDay[brandOffset + dayIdx] * promo[promoOffset + dayIdx] * noise * channelBoost(skuIdx, agentIdx, dayIdx);
      }
    }
  }

  for (let skuIdx = 0; skuIdx < SKU_COUNT; skuIdx += 1) {
    const isBeer = BRAND_IS_BEER[SKU_BRAND_INDEX[skuIdx]] === 1;
    for (let agentIdx = 0; agentIdx < AGENT_COUNT; agentIdx += 1) {
      const start = cubeIndex(skuIdx, agentIdx, 0);
      const outRules = rulesFor(CELL_RULES.sellOut, skuIdx, agentIdx);
      for (let dayIdx = 0; dayIdx < DAY_COUNT; dayIdx += 1) {
        let smoothed = 0;
        for (let lagIdx = 0; lagIdx < SELL_OUT_LAGS.length; lagIdx += 1) {
          const source = dayIdx - SELL_OUT_LAGS[lagIdx];
          smoothed += SELL_OUT_WEIGHTS[lagIdx] * base[start + (source < 0 ? 0 : source)];
        }
        let value = smoothed * SELL_OUT_SHRINK * CONSUMER_DOW[DOW_OF_DAY[dayIdx]] * (isBeer ? BEER_SELL_OUT_BAN_FACTOR[dayIdx] : 1);
        for (const rule of outRules) if (dayIdx >= rule.from && dayIdx <= rule.to) value *= rule.multiplier;
        sellOutCases[start + dayIdx] = value;
      }
      const inRules = rulesFor(CELL_RULES.sellIn, skuIdx, agentIdx);
      for (let dayIdx = 0; dayIdx < DAY_COUNT; dayIdx += 1) base[start + dayIdx] *= ORDER_DAY_FACTOR[dayIdx] * (isBeer ? BEER_ORDER_BAN_FACTOR[dayIdx] : 1);
      for (const rule of inRules) {
        for (let dayIdx = rule.from; dayIdx <= rule.to; dayIdx += 1) base[start + dayIdx] *= rule.multiplier;
      }
    }
  }

  return { sellInCases: base, sellOutCases, targetCases: buildTargets(base) };
}

function buildTargets(sellIn: Float64Array): Float64Array {
  const monthly = new Float64Array(SKU_COUNT * AGENT_COUNT * MONTH_COUNT);
  for (let skuIdx = 0; skuIdx < SKU_COUNT; skuIdx += 1) {
    for (let agentIdx = 0; agentIdx < AGENT_COUNT; agentIdx += 1) {
      const start = cubeIndex(skuIdx, agentIdx, 0);
      const monthOffset = (skuIdx * AGENT_COUNT + agentIdx) * MONTH_COUNT;
      for (let dayIdx = 0; dayIdx < DAY_COUNT; dayIdx += 1) monthly[monthOffset + MONTH_OF_DAY[dayIdx]] += sellIn[start + dayIdx];
    }
  }
  const targets = new Float64Array(monthly.length);
  for (let skuIdx = 0; skuIdx < SKU_COUNT; skuIdx += 1) {
    for (let agentIdx = 0; agentIdx < AGENT_COUNT; agentIdx += 1) {
      const monthOffset = (skuIdx * AGENT_COUNT + agentIdx) * MONTH_COUNT;
      for (let monthIdx = 0; monthIdx < MONTH_COUNT; monthIdx += 1) {
        const lastYear = monthIdx - 12;
        const reference = lastYear >= 0
          ? monthly[monthOffset + lastYear] * TARGET_GROWTH
          : monthly[monthOffset + monthIdx] * (1 + (TARGET_GROWTH - 1) * 0.7) * jitter(0.05, "target", skuIdx, agentIdx, monthIdx);
        targets[monthOffset + monthIdx] = Math.round(reference);
      }
    }
  }
  return targets;
}

export type InventoryTables = {
  outboundCases: Float64Array;
  stockCases: Float64Array;
  avgOutboundCases: Float64Array;
};

export function buildInventory(cube: SalesCube): InventoryTables {
  const size = DC_COUNT * SKU_COUNT * DAY_COUNT;
  const outbound = new Float64Array(size);
  for (let skuIdx = 0; skuIdx < SKU_COUNT; skuIdx += 1) {
    for (let agentIdx = 0; agentIdx < AGENT_COUNT; agentIdx += 1) {
      const dcIdx = AGENT_DC_INDEX[agentIdx];
      const source = cubeIndex(skuIdx, agentIdx, 0);
      const target = (dcIdx * SKU_COUNT + skuIdx) * DAY_COUNT;
      for (let dayIdx = 0; dayIdx < DAY_COUNT; dayIdx += 1) outbound[target + dayIdx] += cube.sellInCases[source + dayIdx];
    }
  }

  const avgOutbound = new Float64Array(size);
  const stock = new Float64Array(size);
  const coverRule = INJECTED_ANOMALIES.find((anomaly) => anomaly.effect.kind === "cover_days");
  const coverWindow = coverRule ? windowDays(coverRule) : null;
  const coverDcIdx = coverRule ? DC_INDEX.get(coverRule.dims.dc as string) ?? -1 : -1;
  const coverSkuIdx = coverRule ? SKUS.findIndex((sku) => sku.id === coverRule.dims.sku) : -1;
  const coverDays = coverRule && coverRule.effect.kind === "cover_days" ? coverRule.effect.value : 0;

  for (let dcIdx = 0; dcIdx < DC_COUNT; dcIdx += 1) {
    for (let skuIdx = 0; skuIdx < SKU_COUNT; skuIdx += 1) {
      const offset = (dcIdx * SKU_COUNT + skuIdx) * DAY_COUNT;
      let running = 0;
      for (let dayIdx = 0; dayIdx < DAY_COUNT; dayIdx += 1) {
        running += outbound[offset + dayIdx];
        if (dayIdx >= COVER_DAYS_WINDOW) running -= outbound[offset + dayIdx - COVER_DAYS_WINDOW];
        const span = Math.min(dayIdx + 1, COVER_DAYS_WINDOW);
        avgOutbound[offset + dayIdx] = running / span;
      }
      const targetDays = 17 + hashNoise("cover", dcIdx, skuIdx) * 7;
      const reorderDays = targetDays * 0.42;
      let onHand = avgOutbound[offset] * targetDays;
      for (let dayIdx = 0; dayIdx < DAY_COUNT; dayIdx += 1) {
        const average = avgOutbound[offset + dayIdx];
        const afterSale = onHand - outbound[offset + dayIdx];
        const inbound = afterSale < average * reorderDays
          ? Math.max(0, average * targetDays * jitter(0.06, "inbound", dcIdx, skuIdx, dayIdx) - afterSale)
          : 0;
        onHand = afterSale + inbound;
        stock[offset + dayIdx] = onHand;
      }
      if (coverWindow && dcIdx === coverDcIdx && skuIdx === coverSkuIdx) {
        for (let dayIdx = coverWindow.from; dayIdx <= coverWindow.to; dayIdx += 1) {
          stock[offset + dayIdx] = avgOutbound[offset + dayIdx] * coverDays * jitter(0.04, "shortfall", dayIdx);
        }
      }
    }
  }
  return { outboundCases: outbound, stockCases: stock, avgOutboundCases: avgOutbound };
}

export type ProductionTables = {
  outputHl: Float64Array;
  capacityHl: Float64Array;
  lineCapacity: Float64Array;
};

export function buildProduction(): ProductionTables {
  const output = new Float64Array(LINE_COUNT * DAY_COUNT);
  const capacity = new Float64Array(LINE_COUNT * DAY_COUNT);
  const lineCapacity = new Float64Array(PRODUCTION_LINES.map((entry) => entry.line.capacityHlPerDay));
  const maintenance = INJECTED_ANOMALIES.find((anomaly) => anomaly.id === "anom_khonkaen_line2");
  const maintenanceWindow = maintenance ? windowDays(maintenance) : null;
  const maintenanceLine = maintenance ? PRODUCTION_LINES.findIndex((entry) => entry.line.id === maintenance.extraDims.line) : -1;
  const maintenanceFactor = maintenance && maintenance.effect.kind === "multiplier" ? maintenance.effect.value : 1;

  for (let lineIdx = 0; lineIdx < LINE_COUNT; lineIdx += 1) {
    const entry = PRODUCTION_LINES[lineIdx];
    const offset = lineIdx * DAY_COUNT;
    for (let dayIdx = 0; dayIdx < DAY_COUNT; dayIdx += 1) {
      const ahead = Math.min(DAY_COUNT - 1, dayIdx + 12);
      const demand = seasonFactor(BRAND_INDEX.get("singha") ?? 0, ahead);
      const weekendDrop = DOW_OF_DAY[dayIdx] === 0 ? 0.35 : 1;
      let utilization = Math.min(0.97, 0.78 * demand * weekendDrop * jitter(0.07, "plant", entry.line.id, dayIdx));
      if (maintenanceWindow && lineIdx === maintenanceLine && dayIdx >= maintenanceWindow.from && dayIdx <= maintenanceWindow.to) {
        utilization *= maintenanceFactor;
      }
      capacity[offset + dayIdx] = entry.line.capacityHlPerDay;
      output[offset + dayIdx] = entry.line.capacityHlPerDay * utilization;
    }
  }
  return { outputHl: output, capacityHl: capacity, lineCapacity };
}

export type MarketingTables = {
  spendThb: Float64Array;
  reach: Float64Array;
  sentiment: Float64Array;
  uplift: Float64Array;
  shareOfVoice: Float64Array;
};

export function buildMarketing(): MarketingTables {
  const spend = new Float64Array(CAMPAIGN_COUNT * DAY_COUNT);
  const reach = new Float64Array(CAMPAIGN_COUNT * DAY_COUNT);
  const sentiment = new Float64Array(CAMPAIGN_COUNT * DAY_COUNT);
  const uplift = new Float64Array(CAMPAIGN_COUNT * DAY_COUNT);

  CAMPAIGNS.forEach((campaign, campaignIdx) => {
    const from = Math.max(0, toDayIndex(campaign.from));
    const to = Math.min(DAY_COUNT - 1, toDayIndex(campaign.to));
    if (to < from) return;
    const length = to - from + 1;
    let weightTotal = 0;
    const weights: number[] = [];
    for (let position = 0; position < length; position += 1) {
      const weight = rampWeight(position, length) * jitter(0.1, campaign.id, "spend", position);
      weights.push(weight);
      weightTotal += weight;
    }
    const offset = campaignIdx * DAY_COUNT;
    for (let position = 0; position < length; position += 1) {
      const dayIdx = from + position;
      const daySpend = (campaign.spendThb * weights[position]) / weightTotal;
      spend[offset + dayIdx] = daySpend;
      reach[offset + dayIdx] = daySpend * 0.021 * jitter(0.18, campaign.id, "reach", dayIdx);
      sentiment[offset + dayIdx] = 0.18 + hashNoise(campaign.id, "sentiment", dayIdx) * 0.46;
      uplift[offset + dayIdx] = campaign.upliftTarget * jitter(0.22, campaign.id, "uplift", dayIdx) * 100;
    }
  });

  const shareOfVoice = new Float64Array(BRAND_COUNT * WEEK_COUNT);
  const competitorBase = COMPETITORS.reduce((total, competitor) => total + competitor.baseShare, 0);
  for (let weekIdx = 0; weekIdx < WEEK_COUNT; weekIdx += 1) {
    const raw = new Float64Array(BRAND_COUNT);
    let total = competitorBase;
    for (let brandIdx = 0; brandIdx < BRAND_COUNT; brandIdx += 1) {
      const brand = BRANDS[brandIdx];
      let value = BRAND_BASE_SOV[brand] * jitter(0.12, "sov", brand, weekIdx);
      for (let campaignIdx = 0; campaignIdx < CAMPAIGN_COUNT; campaignIdx += 1) {
        if (!CAMPAIGNS[campaignIdx].brands.includes(brand)) continue;
        const from = Math.max(0, toDayIndex(CAMPAIGNS[campaignIdx].from));
        const to = Math.min(DAY_COUNT - 1, toDayIndex(CAMPAIGNS[campaignIdx].to));
        if (WEEK_OF_DAY[from] <= weekIdx && weekIdx <= WEEK_OF_DAY[to]) value *= 1.35;
      }
      raw[brandIdx] = value;
      total += value;
    }
    for (let brandIdx = 0; brandIdx < BRAND_COUNT; brandIdx += 1) shareOfVoice[brandIdx * WEEK_COUNT + weekIdx] = (raw[brandIdx] / total) * 100;
  }
  return { spendThb: spend, reach, sentiment, uplift, shareOfVoice };
}

export type FinanceTables = {
  revenueThb: Float64Array;
  cogsThb: Float64Array;
  exciseThb: Float64Array;
  tradeSpendThb: Float64Array;
  grossProfitThb: Float64Array;
  ebitdaThb: Float64Array;
  arOverdueThb: Float64Array;
};

const BU_COUNT = 3;

export function financeIndex(buIdx: number, regionIdx: number, monthIdx: number): number {
  return (buIdx * REGION_COUNT + regionIdx) * MONTH_COUNT + monthIdx;
}

export function buildFinance(cube: SalesCube): FinanceTables {
  const size = BU_COUNT * REGION_COUNT * MONTH_COUNT;
  const revenue = new Float64Array(size);
  const cogs = new Float64Array(size);
  const excise = new Float64Array(size);
  const tradeSpend = new Float64Array(size);
  const grossProfit = new Float64Array(size);
  const ebitda = new Float64Array(size);
  const arOverdue = new Float64Array(AGENT_COUNT * MONTH_COUNT);

  for (let skuIdx = 0; skuIdx < SKU_COUNT; skuIdx += 1) {
    const price = SKU_PRICE_PER_CASE[skuIdx];
    const buIdx = SKU_BU_INDEX[skuIdx];
    for (let agentIdx = 0; agentIdx < AGENT_COUNT; agentIdx += 1) {
      const regionIdx = AGENT_REGION_INDEX[agentIdx];
      const start = cubeIndex(skuIdx, agentIdx, 0);
      for (let dayIdx = 0; dayIdx < DAY_COUNT; dayIdx += 1) {
        const value = cube.sellInCases[start + dayIdx] * price;
        revenue[financeIndex(buIdx, regionIdx, MONTH_OF_DAY[dayIdx])] += value;
        arOverdue[agentIdx * MONTH_COUNT + MONTH_OF_DAY[dayIdx]] += value;
      }
    }
  }

  const buBudgets = ["beer", "non_alcohol", "import"] as const;
  for (let buIdx = 0; buIdx < BU_COUNT; buIdx += 1) {
    const budget = BU_BUDGET_INDEX.get(buBudgets[buIdx]);
    if (!budget) continue;
    for (let regionIdx = 0; regionIdx < REGION_COUNT; regionIdx += 1) {
      const region = REGIONS[regionIdx];
      for (let monthIdx = 0; monthIdx < MONTH_COUNT; monthIdx += 1) {
        const index = financeIndex(buIdx, regionIdx, monthIdx);
        const gross = revenue[index];
        const cogsValue = gross * budget.cogsRatio * jitter(0.035, "cogs", buIdx, regionIdx, monthIdx);
        const exciseValue = gross * budget.exciseRatio;
        const regionBudget = TRADE_SPEND_BUDGET_INDEX.get(region) ?? 0;
        const share = gross === 0 ? 0 : 1;
        const trade = share * (gross * BASELINE_TRADE_SPEND_RATIO + (regionBudget / BU_COUNT) * jitter(0.15, "trade", buIdx, regionIdx, monthIdx) * 0.35);
        cogs[index] = cogsValue;
        excise[index] = exciseValue;
        tradeSpend[index] = trade;
        grossProfit[index] = gross - cogsValue - exciseValue;
        ebitda[index] = grossProfit[index] - trade - gross * budget.opexRatio;
      }
    }
  }

  const overdueRule = INJECTED_ANOMALIES.find((anomaly) => anomaly.id === "anom_south_ar_overdue");
  const overdueAgents = overdueRule ? indicesOf(AGENTS, (overdueRule.extraDims.agents ?? "").split(",")) : new Set<number>();
  const overdueWindow = overdueRule ? windowDays(overdueRule) : null;
  const overdueFactor = overdueRule && overdueRule.effect.kind === "multiplier" ? overdueRule.effect.value : 1;
  const tierLateness: Record<string, number> = { A: 0.035, B: 0.062, C: 0.115 };
  for (let agentIdx = 0; agentIdx < AGENT_COUNT; agentIdx += 1) {
    const agent = AGENTS[agentIdx];
    const lateness = tierLateness[agent.tier] * (agent.creditDays / 30);
    for (let monthIdx = 0; monthIdx < MONTH_COUNT; monthIdx += 1) {
      const index = agentIdx * MONTH_COUNT + monthIdx;
      let value = arOverdue[index] * lateness * jitter(0.28, "ar", agent.id, monthIdx);
      if (overdueWindow && overdueAgents.has(agentIdx) && monthOverlaps(monthIdx, overdueWindow.from, overdueWindow.to)) {
        value *= overdueFactor;
      }
      arOverdue[index] = value;
    }
  }
  return { revenueThb: revenue, cogsThb: cogs, exciseThb: excise, tradeSpendThb: tradeSpend, grossProfitThb: grossProfit, ebitdaThb: ebitda, arOverdueThb: arOverdue };
}

function monthOverlaps(monthIdx: number, from: number, to: number): boolean {
  return MONTH_OF_DAY[from] <= monthIdx && monthIdx <= MONTH_OF_DAY[to];
}

export type HrTables = {
  headcount: Float64Array;
  attritionRate: Float64Array;
  avgSalaryThb: Float64Array;
};

export function buildHr(): HrTables {
  const size = DEPARTMENT_COUNT * MONTH_COUNT;
  const headcount = new Float64Array(size);
  const attrition = new Float64Array(size);
  const salary = new Float64Array(size);
  DEPARTMENTS.forEach((department, departmentIdx) => {
    let people = department.baseHeadcount;
    for (let monthIdx = 0; monthIdx < MONTH_COUNT; monthIdx += 1) {
      const index = departmentIdx * MONTH_COUNT + monthIdx;
      const leaving = department.attritionBase * jitter(0.35, "attrition", department.id, monthIdx);
      people *= 1 + department.monthlyGrowth;
      headcount[index] = Math.round(people);
      attrition[index] = Math.min(0.016, Math.max(0.008, leaving)) * 100;
      salary[index] = Math.round(department.avgSalaryThb * (1 + monthIdx * 0.0022) * jitter(0.012, "salary", department.id, monthIdx));
    }
  });
  return { headcount, attritionRate: attrition, avgSalaryThb: salary };
}

export type ForecastAccuracyTables = { mapePercent: Float64Array };

export function buildForecastAccuracy(): ForecastAccuracyTables {
  const mape = new Float64Array(BRAND_COUNT * REGION_COUNT * MONTH_COUNT);
  for (let brandIdx = 0; brandIdx < BRAND_COUNT; brandIdx += 1) {
    for (let regionIdx = 0; regionIdx < REGION_COUNT; regionIdx += 1) {
      for (let monthIdx = 0; monthIdx < MONTH_COUNT; monthIdx += 1) {
        const index = (brandIdx * REGION_COUNT + regionIdx) * MONTH_COUNT + monthIdx;
        mape[index] = 6 + hashNoise("mape", brandIdx, regionIdx, monthIdx) * 8;
      }
    }
  }
  return { mapePercent: mape };
}

export const MONTH_DAY_COUNTS = new Int32Array(Array.from({ length: MONTH_COUNT }, (_, monthIdx) => daysInMonthIndex(monthIdx)));
export { PLANT_BRAND_MIX };
