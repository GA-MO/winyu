import {
  BRANDS, BUSINESS_UNITS, REGIONS,
  type Dim, type FactRequest, type FactResult, type FactRow, type LabelShift, type MetricId,
} from "@/lib/contracts";
import { RATIO_METRICS } from "@/lib/semantic/metrics";
import {
  financeTables, forecastAccuracyTables, hrTables, inventoryTables, marketTables, marketingTables, productionTables, salesCube,
} from "./cache";
import {
  DAY_COUNT, ISO_OF_DAY, MONTH_COUNT, MONTH_FIRST_DAY, MONTH_KEYS, MONTH_OF_DAY, WEEK_COUNT, WEEK_KEYS, WEEK_MIDDLE_DAY, WEEK_OF_DAY,
  toDayIndex,
} from "./dates";
import { AGENTS } from "./entities/agents";
import { CHANNELS } from "./entities/channels";
import { DEPARTMENTS } from "./entities/hr";
import { CAMPAIGNS } from "./entities/marketing";
import { PROVINCES } from "./entities/org";
import { BRAND_INFO, LITRES_PER_HL, PACKS, SKUS } from "./entities/products";
import { DISTRIBUTION_CENTERS, PLANTS, PLANT_BRAND_MIX, PRODUCTION_LINES } from "./entities/supply";
import { MAKERS } from "./entities/market";
import { MAKER_COUNT, PROVINCE_COUNT, marketIndex } from "./market-share";
import {
  AGENT_COUNT, AGENT_REGION_INDEX, BRAND_COUNT, CAMPAIGN_COUNT, CHANNEL_COUNT,
  DC_COUNT, DEPARTMENT_COUNT, LINE_COUNT, MONTH_DAY_COUNTS, REGION_COUNT, SKU_BRAND_INDEX, SKU_BU_INDEX,
  SKU_COUNT, SKU_HL_PER_CASE, SKU_PACK_INDEX, SKU_PRICE_PER_CASE, channelShare, cubeIndex,
} from "./generator";

const MAX_GROUPS = 4_000_000;
const PERCENT = 100;
const TOO_WIDE = "มิติที่ขอกว้างเกินไป กรุณาลดจำนวนมิติหรือช่วงเวลา";

type Filters = Map<Dim, Set<string>>;
type AxisSpec = { count: number; dims: Dim[]; valueOf: (index: number, dim: Dim) => string };
type AxisPlan = { size: number; codes: Int32Array; values: string[][]; dims: Dim[]; allow: Uint8Array | null; stride: number };

function planAxis(spec: AxisSpec, groupDims: Dim[], filters: Filters): AxisPlan {
  const own = groupDims.filter((dim) => spec.dims.includes(dim));
  const filtered = spec.dims.filter((dim) => filters.has(dim));
  const codes = new Int32Array(spec.count);
  const values: string[][] = [];
  const seen = new Map<string, number>();
  let allow: Uint8Array | null = null;
  if (filtered.length > 0) allow = new Uint8Array(spec.count);
  for (let index = 0; index < spec.count; index += 1) {
    const tuple = own.map((dim) => spec.valueOf(index, dim));
    const key = tuple.join("\u0001");
    let code = seen.get(key);
    if (code === undefined) {
      code = values.length;
      values.push(tuple);
      seen.set(key, code);
    }
    codes[index] = code;
    if (allow) {
      const passes = filtered.every((dim) => (filters.get(dim) as Set<string>).has(spec.valueOf(index, dim)));
      allow[index] = passes ? 1 : 0;
    }
  }
  return { size: values.length, codes, values, dims: own, allow, stride: 1 };
}

function assignStrides(plans: AxisPlan[]): number {
  let stride = 1;
  for (let index = plans.length - 1; index >= 0; index -= 1) {
    plans[index].stride = stride;
    stride *= plans[index].size;
  }
  return stride;
}

type Accumulator = { numerator: Float64Array; denominator: Float64Array; total: number };

function accumulator(size: number): Accumulator {
  return { numerator: new Float64Array(size), denominator: new Float64Array(size), total: size };
}

function decode(plans: AxisPlan[], code: number): Record<Dim, string> {
  const out = {} as Record<Dim, string>;
  let rest = code;
  for (const plan of plans) {
    const axisCode = Math.floor(rest / plan.stride) % plan.size;
    rest -= axisCode * plan.stride;
    plan.dims.forEach((dim, position) => {
      out[dim] = plan.values[axisCode][position];
    });
  }
  return out;
}

const SKU_AXIS: AxisSpec = {
  count: SKU_COUNT,
  dims: ["sku", "brand", "pack", "business_unit"],
  valueOf: (index, dim) => {
    if (dim === "sku") return SKUS[index].id;
    if (dim === "brand") return BRANDS[SKU_BRAND_INDEX[index]];
    if (dim === "pack") return PACKS[SKU_PACK_INDEX[index]];
    return BUSINESS_UNITS[SKU_BU_INDEX[index]];
  },
};

const AGENT_AXIS: AxisSpec = {
  count: AGENT_COUNT,
  dims: ["agent", "province", "region"],
  valueOf: (index, dim) => {
    if (dim === "agent") return AGENTS[index].id;
    if (dim === "province") return AGENTS[index].provinceId;
    return REGIONS[AGENT_REGION_INDEX[index]];
  },
};

function clampDay(index: number): number {
  if (index < 0) return 0;
  if (index > DAY_COUNT - 1) return DAY_COUNT - 1;
  return index;
}

type Shift = LabelShift;

const NO_SHIFT: Shift = { days: 0, months: 0 };

function clampMonth(index: number): number {
  if (index < 0) return 0;
  if (index > MONTH_COUNT - 1) return MONTH_COUNT - 1;
  return index;
}

function monthLabelOfDay(dayIndex: number, shift: Shift): string {
  if (shift.months !== 0) return MONTH_KEYS[clampMonth(MONTH_OF_DAY[dayIndex] + shift.months)];
  return MONTH_KEYS[MONTH_OF_DAY[clampDay(dayIndex + shift.days)]];
}

function dayAxis(shift: Shift): AxisSpec {
  return {
    count: DAY_COUNT,
    dims: ["date", "week", "month"],
    valueOf: (index, dim) => {
      const shifted = clampDay(index + shift.days);
      if (dim === "date") return ISO_OF_DAY[shifted];
      if (dim === "week") return WEEK_KEYS[WEEK_OF_DAY[shifted]];
      return monthLabelOfDay(index, shift);
    },
  };
}

const CHANNEL_AXIS: AxisSpec = { count: CHANNEL_COUNT, dims: ["channel"], valueOf: (index) => CHANNELS[index].id };

const DC_AXIS: AxisSpec = {
  count: DC_COUNT,
  dims: ["dc", "region"],
  valueOf: (index, dim) => (dim === "dc" ? DISTRIBUTION_CENTERS[index].id : DISTRIBUTION_CENTERS[index].region),
};

const LINE_AXIS: AxisSpec = {
  count: LINE_COUNT,
  dims: ["plant", "region"],
  valueOf: (index, dim) => {
    const plant = PLANTS[PRODUCTION_LINES[index].plantIndex];
    return dim === "plant" ? plant.id : plant.region;
  },
};

const BRAND_AXIS: AxisSpec = {
  count: BRAND_COUNT,
  dims: ["brand", "business_unit"],
  valueOf: (index, dim) => (dim === "brand" ? BRANDS[index] : BRAND_INFO[index].businessUnit),
};

const PROVINCE_AXIS: AxisSpec = {
  count: PROVINCE_COUNT,
  dims: ["province", "region"],
  valueOf: (index, dim) => (dim === "province" ? PROVINCES[index].id : PROVINCES[index].region),
};
const MAKER_AXIS: AxisSpec = { count: MAKER_COUNT, dims: ["maker"], valueOf: (index) => MAKERS[index].id };
const REGION_AXIS: AxisSpec = { count: REGION_COUNT, dims: ["region"], valueOf: (index) => REGIONS[index] };
const CAMPAIGN_AXIS: AxisSpec = { count: CAMPAIGN_COUNT, dims: ["campaign"], valueOf: (index) => CAMPAIGNS[index].id };
const DEPARTMENT_AXIS: AxisSpec = { count: DEPARTMENT_COUNT, dims: ["department"], valueOf: (index) => DEPARTMENTS[index].id };
const BU_AXIS: AxisSpec = { count: BUSINESS_UNITS.length, dims: ["business_unit"], valueOf: (index) => BUSINESS_UNITS[index] };
function monthAxis(shift: Shift): AxisSpec {
  return {
    count: MONTH_COUNT,
    dims: ["month"],
    valueOf: (index) => monthLabelOfDay(MONTH_FIRST_DAY[index], shift),
  };
}

function weekAxis(shift: Shift): AxisSpec {
  return {
    count: WEEK_COUNT,
    dims: ["week", "month"],
    valueOf: (index, dim) => {
      const middle = weekMiddleDay(index);
      if (dim === "month") return monthLabelOfDay(middle, shift);
      return WEEK_KEYS[WEEK_OF_DAY[clampDay(middle + shift.days)]];
    },
  };
}

function weekMiddleDay(weekIndex: number): number {
  return WEEK_MIDDLE_DAY[weekIndex];
}

type Shape = { axes: AxisSpec[]; scan: (plans: AxisPlan[], acc: Accumulator, from: number, to: number) => void };

type SalesKind = "sell_in_volume" | "sell_in_value" | "sell_out_volume" | "target_volume" | "target_value" | "attainment";

function salesShape(kind: SalesKind, shift: Shift): Shape {
  return {
    axes: [SKU_AXIS, AGENT_AXIS, dayAxis(shift), CHANNEL_AXIS],
    scan: (plans, acc, from, to) => scanSales(kind, plans, acc, from, to),
  };
}

function skuFactor(kind: SalesKind, skuIdx: number): number {
  if (kind === "sell_in_value" || kind === "target_value") return SKU_PRICE_PER_CASE[skuIdx];
  return SKU_HL_PER_CASE[skuIdx] * LITRES_PER_HL;
}

function scanSales(kind: SalesKind, plans: AxisPlan[], acc: Accumulator, from: number, to: number): void {
  const cube = salesCube();
  const [skuPlan, agentPlan, dayPlan, channelPlan] = plans;
  const needsChannel = channelPlan.size > 1 || channelPlan.allow !== null;
  const wantsTarget = kind === "target_volume" || kind === "target_value" || kind === "attainment";
  const wantsActual = kind !== "target_volume" && kind !== "target_value";
  const source = kind === "sell_out_volume" ? cube.sellOutCases : cube.sellInCases;
  for (let skuIdx = 0; skuIdx < SKU_COUNT; skuIdx += 1) {
    if (skuPlan.allow && skuPlan.allow[skuIdx] === 0) continue;
    const factor = skuFactor(kind, skuIdx);
    const skuCode = skuPlan.codes[skuIdx] * skuPlan.stride;
    const targetOffset = skuIdx * AGENT_COUNT;
    for (let agentIdx = 0; agentIdx < AGENT_COUNT; agentIdx += 1) {
      if (agentPlan.allow && agentPlan.allow[agentIdx] === 0) continue;
      const agentCode = agentPlan.codes[agentIdx] * agentPlan.stride;
      const cellStart = cubeIndex(skuIdx, agentIdx, 0);
      const monthlyTarget = (targetOffset + agentIdx) * MONTH_COUNT;
      for (let dayIdx = from; dayIdx <= to; dayIdx += 1) {
        if (dayPlan.allow && dayPlan.allow[dayIdx] === 0) continue;
        const base = skuCode + agentCode + dayPlan.codes[dayIdx] * dayPlan.stride;
        const actual = wantsActual ? source[cellStart + dayIdx] * factor : 0;
        const monthIdx = MONTH_OF_DAY[dayIdx];
        const target = wantsTarget ? (cube.targetCases[monthlyTarget + monthIdx] / MONTH_DAY_COUNTS[monthIdx]) * factor : 0;
        if (!needsChannel) {
          const code = base + channelPlan.codes[0] * channelPlan.stride;
          addSalesCell(kind, acc, code, actual, target);
          continue;
        }
        for (let channelIdx = 0; channelIdx < CHANNEL_COUNT; channelIdx += 1) {
          if (channelPlan.allow && channelPlan.allow[channelIdx] === 0) continue;
          const share = channelShare(skuIdx, agentIdx, dayIdx, channelIdx);
          const code = base + channelPlan.codes[channelIdx] * channelPlan.stride;
          addSalesCell(kind, acc, code, actual * share, target * share);
        }
      }
    }
  }
}

function addSalesCell(kind: SalesKind, acc: Accumulator, code: number, actual: number, target: number): void {
  if (kind === "attainment") {
    acc.numerator[code] += actual * PERCENT;
    acc.denominator[code] += target;
    return;
  }
  if (kind === "target_volume" || kind === "target_value") {
    acc.numerator[code] += target;
    return;
  }
  acc.numerator[code] += actual;
}

function lastDayOfBucket(dayPlan: AxisPlan, from: number, to: number): Uint8Array {
  const lastDay = new Int32Array(dayPlan.size).fill(-1);
  for (let dayIdx = from; dayIdx <= to; dayIdx += 1) {
    if (dayPlan.allow && dayPlan.allow[dayIdx] === 0) continue;
    lastDay[dayPlan.codes[dayIdx]] = dayIdx;
  }
  const mask = new Uint8Array(DAY_COUNT);
  for (let code = 0; code < lastDay.length; code += 1) if (lastDay[code] >= 0) mask[lastDay[code]] = 1;
  return mask;
}

function lastMonthOfBucket(monthPlan: AxisPlan, firstMonth: number, lastMonth: number): Uint8Array {
  const last = new Int32Array(monthPlan.size).fill(-1);
  for (let monthIdx = firstMonth; monthIdx <= lastMonth; monthIdx += 1) {
    if (monthPlan.allow && monthPlan.allow[monthIdx] === 0) continue;
    last[monthPlan.codes[monthIdx]] = monthIdx;
  }
  const mask = new Uint8Array(MONTH_COUNT);
  for (let code = 0; code < last.length; code += 1) if (last[code] >= 0) mask[last[code]] = 1;
  return mask;
}

function inventoryShape(kind: "stock" | "cover", shift: Shift): Shape {
  return {
    axes: [DC_AXIS, SKU_AXIS, dayAxis(shift)],
    scan: (plans, acc, from, to) => {
      const tables = inventoryTables();
      const [dcPlan, skuPlan, dayPlan] = plans;
      const snapshot = lastDayOfBucket(dayPlan, from, to);
      for (let dcIdx = 0; dcIdx < DC_COUNT; dcIdx += 1) {
        if (dcPlan.allow && dcPlan.allow[dcIdx] === 0) continue;
        const dcCode = dcPlan.codes[dcIdx] * dcPlan.stride;
        for (let skuIdx = 0; skuIdx < SKU_COUNT; skuIdx += 1) {
          if (skuPlan.allow && skuPlan.allow[skuIdx] === 0) continue;
          const skuCode = skuPlan.codes[skuIdx] * skuPlan.stride;
          const offset = (dcIdx * SKU_COUNT + skuIdx) * DAY_COUNT;
          for (let dayIdx = from; dayIdx <= to; dayIdx += 1) {
            if (snapshot[dayIdx] === 0) continue;
            const code = dcCode + skuCode + dayPlan.codes[dayIdx] * dayPlan.stride;
            acc.numerator[code] += tables.stockCases[offset + dayIdx];
            acc.denominator[code] += kind === "cover" ? tables.avgOutboundCases[offset + dayIdx] : 1;
          }
        }
      }
    },
  };
}

function productionShape(kind: "output" | "utilization" | "capacity", shift: Shift): Shape {
  return {
    axes: [LINE_AXIS, BRAND_AXIS, dayAxis(shift)],
    scan: (plans, acc, from, to) => {
      const tables = productionTables();
      const [linePlan, brandPlan, dayPlan] = plans;
      const needsBrand = brandPlan.size > 1 || brandPlan.allow !== null;
      for (let lineIdx = 0; lineIdx < LINE_COUNT; lineIdx += 1) {
        if (linePlan.allow && linePlan.allow[lineIdx] === 0) continue;
        const plantId = PRODUCTION_LINES[lineIdx].plantId;
        const mix = PLANT_BRAND_MIX[plantId];
        const lineCode = linePlan.codes[lineIdx] * linePlan.stride;
        const offset = lineIdx * DAY_COUNT;
        for (let dayIdx = from; dayIdx <= to; dayIdx += 1) {
          if (dayPlan.allow && dayPlan.allow[dayIdx] === 0) continue;
          const output = tables.outputHl[offset + dayIdx] * LITRES_PER_HL;
          const capacity = tables.capacityHl[offset + dayIdx] * LITRES_PER_HL;
          const dayCode = dayPlan.codes[dayIdx] * dayPlan.stride;
          const measured = kind === "capacity" ? capacity : kind === "utilization" ? output * PERCENT : output;
          if (!needsBrand) {
            const code = lineCode + dayCode + brandPlan.codes[0] * brandPlan.stride;
            acc.numerator[code] += measured;
            acc.denominator[code] += kind === "utilization" ? capacity : 1;
            continue;
          }
          for (let brandIdx = 0; brandIdx < BRAND_COUNT; brandIdx += 1) {
            if (brandPlan.allow && brandPlan.allow[brandIdx] === 0) continue;
            const share = mix[BRANDS[brandIdx]] ?? 0;
            const code = lineCode + dayCode + brandPlan.codes[brandIdx] * brandPlan.stride;
            acc.numerator[code] += measured * share;
            acc.denominator[code] += (kind === "utilization" ? capacity : 1) * share;
          }
        }
      }
    },
  };
}

type CampaignKind = "spend" | "reach" | "sentiment" | "uplift";

function campaignShape(kind: CampaignKind, shift: Shift): Shape {
  return {
    axes: [CAMPAIGN_AXIS, BRAND_AXIS, REGION_AXIS, dayAxis(shift)],
    scan: (plans, acc, from, to) => {
      const tables = marketingTables();
      const [campaignPlan, brandPlan, regionPlan, dayPlan] = plans;
      const series = kind === "spend" ? tables.spendThb : kind === "reach" ? tables.reach : kind === "sentiment" ? tables.sentiment : tables.uplift;
      const isMean = kind === "sentiment" || kind === "uplift";
      for (let campaignIdx = 0; campaignIdx < CAMPAIGN_COUNT; campaignIdx += 1) {
        if (campaignPlan.allow && campaignPlan.allow[campaignIdx] === 0) continue;
        const campaign = CAMPAIGNS[campaignIdx];
        const brandIndices = campaign.brands.map((brand) => BRANDS.indexOf(brand));
        const regionIndices = (campaign.regions === "all" ? REGIONS : campaign.regions).map((region) => REGIONS.indexOf(region));
        const campaignCode = campaignPlan.codes[campaignIdx] * campaignPlan.stride;
        const offset = campaignIdx * DAY_COUNT;
        for (const brandIdx of brandIndices) {
          if (brandPlan.allow && brandPlan.allow[brandIdx] === 0) continue;
          const brandCode = brandPlan.codes[brandIdx] * brandPlan.stride;
          for (const regionIdx of regionIndices) {
            if (regionPlan.allow && regionPlan.allow[regionIdx] === 0) continue;
            const regionCode = regionPlan.codes[regionIdx] * regionPlan.stride;
            const split = 1 / (brandIndices.length * regionIndices.length);
            for (let dayIdx = from; dayIdx <= to; dayIdx += 1) {
              if (dayPlan.allow && dayPlan.allow[dayIdx] === 0) continue;
              const raw = series[offset + dayIdx];
              if (raw === 0) continue;
              const code = campaignCode + brandCode + regionCode + dayPlan.codes[dayIdx] * dayPlan.stride;
              acc.numerator[code] += isMean ? raw : raw * split;
              acc.denominator[code] += isMean ? 1 : split;
            }
          }
        }
      }
    },
  };
}

/** Weeks whose middle day falls in the range, so a weekly metric asked for August never answers with July's or September's weeks; a range shorter than a week gets the week it ends in. */
function weeksCentredIn(from: number, to: number): { firstWeek: number; lastWeek: number } {
  let firstWeek = WEEK_OF_DAY[from];
  let lastWeek = WEEK_OF_DAY[to];
  if (WEEK_MIDDLE_DAY[firstWeek] < from) firstWeek += 1;
  if (WEEK_MIDDLE_DAY[lastWeek] > to) lastWeek -= 1;
  if (firstWeek > lastWeek) return { firstWeek: WEEK_OF_DAY[to], lastWeek: WEEK_OF_DAY[to] };
  return { firstWeek, lastWeek };
}

function sovShape(shift: Shift): Shape {
  return {
  axes: [BRAND_AXIS, weekAxis(shift)],
  scan: (plans, acc, from, to) => {
    const tables = marketingTables();
    const [brandPlan, weekPlan] = plans;
    const { firstWeek, lastWeek } = weeksCentredIn(from, to);
    for (let brandIdx = 0; brandIdx < BRAND_COUNT; brandIdx += 1) {
      if (brandPlan.allow && brandPlan.allow[brandIdx] === 0) continue;
      const brandCode = brandPlan.codes[brandIdx] * brandPlan.stride;
      for (let weekIdx = firstWeek; weekIdx <= lastWeek; weekIdx += 1) {
        if (weekPlan.allow && weekPlan.allow[weekIdx] === 0) continue;
        const code = brandCode + weekPlan.codes[weekIdx] * weekPlan.stride;
        acc.numerator[code] += tables.shareOfVoice[brandIdx * WEEK_COUNT + weekIdx];
        acc.denominator[code] += 1;
      }
    }
  },
  };
}

function marketShareShape(shift: Shift): Shape {
  return {
    axes: [MAKER_AXIS, PROVINCE_AXIS, monthAxis(shift)],
    scan: (plans, acc, from, to) => {
      const { makerLitres } = marketTables();
      const [makerPlan, provincePlan, monthPlan] = plans;
      const firstMonth = MONTH_OF_DAY[from];
      const lastMonth = MONTH_OF_DAY[to];
      for (let provinceIdx = 0; provinceIdx < PROVINCE_COUNT; provinceIdx += 1) {
        if (provincePlan.allow && provincePlan.allow[provinceIdx] === 0) continue;
        const provinceCode = provincePlan.codes[provinceIdx] * provincePlan.stride;
        for (let monthIdx = firstMonth; monthIdx <= lastMonth; monthIdx += 1) {
          if (monthPlan.allow && monthPlan.allow[monthIdx] === 0) continue;
          let market = 0;
          for (let makerIdx = 0; makerIdx < MAKER_COUNT; makerIdx += 1) market += makerLitres[marketIndex(makerIdx, provinceIdx, monthIdx)];
          if (market === 0) continue;
          const monthCode = monthPlan.codes[monthIdx] * monthPlan.stride;
          for (let makerIdx = 0; makerIdx < MAKER_COUNT; makerIdx += 1) {
            if (makerPlan.allow && makerPlan.allow[makerIdx] === 0) continue;
            const code = makerPlan.codes[makerIdx] * makerPlan.stride + provinceCode + monthCode;
            acc.numerator[code] += makerLitres[marketIndex(makerIdx, provinceIdx, monthIdx)] * PERCENT;
            acc.denominator[code] += market;
          }
        }
      }
    },
  };
}

type FinanceKind = "gross_margin" | "trade_spend";

function financeShape(kind: FinanceKind, shift: Shift): Shape {
  return {
    axes: [BU_AXIS, REGION_AXIS, monthAxis(shift)],
    scan: (plans, acc, from, to) => {
      const tables = financeTables();
      const [buPlan, regionPlan, monthPlan] = plans;
      const firstMonth = MONTH_OF_DAY[from];
      const lastMonth = MONTH_OF_DAY[to];
      for (let buIdx = 0; buIdx < BUSINESS_UNITS.length; buIdx += 1) {
        if (buPlan.allow && buPlan.allow[buIdx] === 0) continue;
        const buCode = buPlan.codes[buIdx] * buPlan.stride;
        for (let regionIdx = 0; regionIdx < REGION_COUNT; regionIdx += 1) {
          if (regionPlan.allow && regionPlan.allow[regionIdx] === 0) continue;
          const regionCode = regionPlan.codes[regionIdx] * regionPlan.stride;
          for (let monthIdx = firstMonth; monthIdx <= lastMonth; monthIdx += 1) {
            if (monthPlan.allow && monthPlan.allow[monthIdx] === 0) continue;
            const source = (buIdx * REGION_COUNT + regionIdx) * MONTH_COUNT + monthIdx;
            const code = buCode + regionCode + monthPlan.codes[monthIdx] * monthPlan.stride;
            if (kind === "trade_spend") {
              acc.numerator[code] += tables.tradeSpendThb[source];
              acc.denominator[code] += 1;
              continue;
            }
            acc.numerator[code] += tables.grossProfitThb[source] * PERCENT;
            acc.denominator[code] += tables.revenueThb[source];
          }
        }
      }
    },
  };
}

function arShape(shift: Shift): Shape {
  return {
  axes: [AGENT_AXIS, monthAxis(shift)],
  scan: (plans, acc, from, to) => {
    const tables = financeTables();
    const [agentPlan, monthPlan] = plans;
    const firstMonth = MONTH_OF_DAY[from];
    const lastMonth = MONTH_OF_DAY[to];
    const closing = lastMonthOfBucket(monthPlan, firstMonth, lastMonth);
    for (let agentIdx = 0; agentIdx < AGENT_COUNT; agentIdx += 1) {
      if (agentPlan.allow && agentPlan.allow[agentIdx] === 0) continue;
      const agentCode = agentPlan.codes[agentIdx] * agentPlan.stride;
      for (let monthIdx = firstMonth; monthIdx <= lastMonth; monthIdx += 1) {
        if (closing[monthIdx] === 0) continue;
        const code = agentCode + monthPlan.codes[monthIdx] * monthPlan.stride;
        acc.numerator[code] += tables.arOverdueThb[agentIdx * MONTH_COUNT + monthIdx];
        acc.denominator[code] += 1;
      }
    }
  },
  };
}

type HrKind = "headcount" | "attrition_rate" | "avg_salary";

function allowedCount(plan: AxisPlan, count: number): number {
  if (!plan.allow) return count;
  return plan.allow.reduce((sum, allowed) => sum + allowed, 0) || 1;
}

function hrShape(kind: HrKind, shift: Shift): Shape {
  return {
    axes: [DEPARTMENT_AXIS, monthAxis(shift)],
    scan: (plans, acc, from, to) => {
      const tables = hrTables();
      const [departmentPlan, monthPlan] = plans;
      const firstMonth = MONTH_OF_DAY[from];
      const lastMonth = MONTH_OF_DAY[to];
      const departmentsPerRow = departmentPlan.dims.length > 0 ? 1 : allowedCount(departmentPlan, DEPARTMENT_COUNT);
      for (let departmentIdx = 0; departmentIdx < DEPARTMENT_COUNT; departmentIdx += 1) {
        if (departmentPlan.allow && departmentPlan.allow[departmentIdx] === 0) continue;
        const departmentCode = departmentPlan.codes[departmentIdx] * departmentPlan.stride;
        for (let monthIdx = firstMonth; monthIdx <= lastMonth; monthIdx += 1) {
          if (monthPlan.allow && monthPlan.allow[monthIdx] === 0) continue;
          const source = departmentIdx * MONTH_COUNT + monthIdx;
          const people = tables.headcount[source];
          const code = departmentCode + monthPlan.codes[monthIdx] * monthPlan.stride;
          if (kind === "headcount") {
            acc.numerator[code] += people;
            acc.denominator[code] += 1 / departmentsPerRow;
            continue;
          }
          const series = kind === "attrition_rate" ? tables.attritionRate : tables.avgSalaryThb;
          acc.numerator[code] += series[source] * people;
          acc.denominator[code] += people;
        }
      }
    },
  };
}

function mapeShape(shift: Shift): Shape {
  return {
  axes: [BRAND_AXIS, REGION_AXIS, monthAxis(shift)],
  scan: (plans, acc, from, to) => {
    const tables = forecastAccuracyTables();
    const [brandPlan, regionPlan, monthPlan] = plans;
    const firstMonth = MONTH_OF_DAY[from];
    const lastMonth = MONTH_OF_DAY[to];
    for (let brandIdx = 0; brandIdx < BRAND_COUNT; brandIdx += 1) {
      if (brandPlan.allow && brandPlan.allow[brandIdx] === 0) continue;
      const brandCode = brandPlan.codes[brandIdx] * brandPlan.stride;
      for (let regionIdx = 0; regionIdx < REGION_COUNT; regionIdx += 1) {
        if (regionPlan.allow && regionPlan.allow[regionIdx] === 0) continue;
        const regionCode = regionPlan.codes[regionIdx] * regionPlan.stride;
        for (let monthIdx = firstMonth; monthIdx <= lastMonth; monthIdx += 1) {
          if (monthPlan.allow && monthPlan.allow[monthIdx] === 0) continue;
          const code = brandCode + regionCode + monthPlan.codes[monthIdx] * monthPlan.stride;
          acc.numerator[code] += tables.mapePercent[(brandIdx * REGION_COUNT + regionIdx) * MONTH_COUNT + monthIdx];
          acc.denominator[code] += 1;
        }
      }
    }
  },
  };
}

function shapeFor(metric: MetricId, shift: Shift): Shape {
  switch (metric) {
    case "net_sales_volume": return salesShape("sell_in_volume", shift);
    case "net_sales_value": return salesShape("sell_in_value", shift);
    case "sell_out_volume": return salesShape("sell_out_volume", shift);
    case "target_attainment": return salesShape("attainment", shift);
    case "stock_on_hand": return inventoryShape("stock", shift);
    case "days_of_cover": return inventoryShape("cover", shift);
    case "production_output": return productionShape("output", shift);
    case "capacity_utilization": return productionShape("utilization", shift);
    case "forecast_mape": return mapeShape(shift);
    case "campaign_spend": return campaignShape("spend", shift);
    case "campaign_reach": return campaignShape("reach", shift);
    case "campaign_uplift": return campaignShape("uplift", shift);
    case "sentiment_score": return campaignShape("sentiment", shift);
    case "share_of_voice": return sovShape(shift);
    case "gross_margin": return financeShape("gross_margin", shift);
    case "trade_spend": return financeShape("trade_spend", shift);
    case "ar_overdue": return arShape(shift);
    case "market_share": return marketShareShape(shift);
    default: return hrShape(metric as HrKind, shift);
  }
}

function targetShapeFor(metric: MetricId): Shape | null {
  if (metric === "net_sales_volume" || metric === "sell_out_volume") return salesShape("target_volume", NO_SHIFT);
  if (metric === "net_sales_value") return salesShape("target_value", NO_SHIFT);
  return null;
}

function aggregate(shape: Shape, dims: Dim[], filters: Filters, from: number, to: number, ratio: boolean): FactResult {
  const plans = shape.axes.map((axis) => planAxis(axis, dims, filters));
  const size = assignStrides(plans);
  if (size > MAX_GROUPS) return { ok: false, code: "BAD_QUERY", error: TOO_WIDE };
  const acc = accumulator(size);
  shape.scan(plans, acc, from, to);
  const rows: FactRow[] = [];
  for (let code = 0; code < size; code += 1) {
    const numerator = acc.numerator[code];
    const denominator = acc.denominator[code];
    if (numerator === 0 && denominator === 0) continue;
    const value = ratio ? (denominator === 0 ? 0 : numerator / denominator) : numerator;
    rows.push({ dims: decode(plans, code), value, weight: ratio ? denominator : 1 });
  }
  return { ok: true, rows };
}

function filterMap(filters: FactRequest["filters"]): Filters {
  const map: Filters = new Map();
  for (const [dim, values] of Object.entries(filters) as [Dim, string[] | undefined][]) {
    if (values && values.length > 0) map.set(dim, new Set(values));
  }
  return map;
}

/** The generator as a warehouse: one aggregate per request, read from the cached typed arrays; it never sees who asked. */
export function readGeneratorFacts(request: FactRequest): FactResult {
  const shape = request.measure === "target" ? targetShapeFor(request.metric) : shapeFor(request.metric, request.labelShift);
  if (!shape) return { ok: false, code: "BAD_QUERY", error: `เมตริก ${request.metric} ไม่มีเป้าหมายให้เทียบ` };
  const ratio = request.measure === "actual" && RATIO_METRICS.has(request.metric);
  return aggregate(shape, request.dims, filterMap(request.filters), toDayIndex(request.range.from), toDayIndex(request.range.to), ratio);
}
