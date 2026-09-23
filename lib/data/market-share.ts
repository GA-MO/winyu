import { DAY_COUNT, MONTH_COUNT, MONTH_KEYS, MONTH_OF_DAY } from "./dates";
import { PROVINCES } from "./entities/org";
import { BASE_SHARE, CARABAO_MONTHLY_GAIN, MAKERS, OWN_MAKER, SHARE_PUSHES, type MakerId } from "./entities/market";
import { LITRES_PER_HL } from "./entities/products";
import { AGENT_COUNT, AGENT_PROVINCE_INDEX, BRAND_IS_BEER, SKU_BRAND_INDEX, SKU_COUNT, SKU_HL_PER_CASE, cubeIndex, type SalesCube } from "./generator";
import { hashNoise } from "./random";

export const MAKER_COUNT = MAKERS.length;
export const PROVINCE_COUNT = PROVINCES.length;

const PERCENT = 100;
const PROVINCE_SPREAD = 4;
const MONTHLY_NOISE = 0.8;
const CARABAO_FROM_US = 0.6;
const LAST_AUDITED_MONTH = MONTH_COUNT - 2;

export type MarketTables = {
  /** Beer litres per maker, indexed [maker][province][month]. */
  makerLitres: Float64Array;
};

export function marketIndex(makerIdx: number, provinceIdx: number, monthIdx: number): number {
  return (makerIdx * PROVINCE_COUNT + provinceIdx) * MONTH_COUNT + monthIdx;
}

function ownBeerLitres(cube: SalesCube): Float64Array {
  const litres = new Float64Array(PROVINCE_COUNT * MONTH_COUNT);
  for (let skuIdx = 0; skuIdx < SKU_COUNT; skuIdx += 1) {
    if (BRAND_IS_BEER[SKU_BRAND_INDEX[skuIdx]] !== 1) continue;
    const perCase = SKU_HL_PER_CASE[skuIdx] * LITRES_PER_HL;
    for (let agentIdx = 0; agentIdx < AGENT_COUNT; agentIdx += 1) {
      const provinceOffset = AGENT_PROVINCE_INDEX[agentIdx] * MONTH_COUNT;
      const start = cubeIndex(skuIdx, agentIdx, 0);
      for (let dayIdx = 0; dayIdx < DAY_COUNT; dayIdx += 1) {
        litres[provinceOffset + MONTH_OF_DAY[dayIdx]] += cube.sellOutCases[start + dayIdx] * perCase;
      }
    }
  }
  return litres;
}

function pushOf(provinceId: string, maker: MakerId, monthIdx: number): { gain: number; fromUs: number } {
  const month = MONTH_KEYS[monthIdx] as string;
  let gain = 0;
  let fromUs = 0;
  for (const push of SHARE_PUSHES) {
    if (push.provinceId !== provinceId || push.maker !== maker || month < push.fromMonth) continue;
    const first = MONTH_KEYS.indexOf(push.fromMonth);
    const last = MONTH_KEYS.indexOf(push.toMonth);
    const points = push.points * Math.min(1, (monthIdx - first + 1) / (last - first + 1));
    gain += points;
    fromUs += points * push.fromUs;
  }
  return { gain, fromUs };
}

function sharesOf(provinceIdx: number, monthIdx: number): Record<MakerId, number> {
  const province = PROVINCES[provinceIdx];
  const base = BASE_SHARE[province.region];
  const tilt = (hashNoise("share_tilt", province.id) - 0.5) * PROVINCE_SPREAD;
  const drift = CARABAO_MONTHLY_GAIN * monthIdx;
  const push = pushOf(province.id, "mk_carabao", monthIdx);
  const noise = (maker: MakerId) => (hashNoise("share", maker, province.id, monthIdx) - 0.5) * MONTHLY_NOISE;
  const raw: Record<MakerId, number> = {
    mk_boonrawd: base.mk_boonrawd + tilt - drift * CARABAO_FROM_US - push.fromUs + noise("mk_boonrawd"),
    mk_thaibev: base.mk_thaibev - tilt - drift * (1 - CARABAO_FROM_US) - (push.gain - push.fromUs) + noise("mk_thaibev"),
    mk_carabao: base.mk_carabao + drift + push.gain + noise("mk_carabao"),
    mk_other: base.mk_other + noise("mk_other"),
  };
  const total = Object.values(raw).reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(Object.entries(raw).map(([maker, value]) => [maker, (value / total) * PERCENT])) as Record<MakerId, number>;
}

/** A monthly retail audit of the beer market per province: our litres are our own beer sell-out, the market is what that share implies. */
export function buildMarketShare(cube: SalesCube): MarketTables {
  const own = ownBeerLitres(cube);
  const makerLitres = new Float64Array(MAKER_COUNT * PROVINCE_COUNT * MONTH_COUNT);
  const ownIdx = MAKERS.findIndex((maker) => maker.id === OWN_MAKER);
  for (let provinceIdx = 0; provinceIdx < PROVINCE_COUNT; provinceIdx += 1) {
    for (let monthIdx = 0; monthIdx <= LAST_AUDITED_MONTH; monthIdx += 1) {
      const shares = sharesOf(provinceIdx, monthIdx);
      const ownLitres = own[provinceIdx * MONTH_COUNT + monthIdx] as number;
      const market = ownLitres / (shares[OWN_MAKER] / PERCENT);
      MAKERS.forEach((maker, makerIdx) => {
        makerLitres[marketIndex(makerIdx, provinceIdx, monthIdx)] = makerIdx === ownIdx ? ownLitres : market * (shares[maker.id] / PERCENT);
      });
    }
  }
  return { makerLitres };
}
