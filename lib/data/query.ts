import {
  BRANDS, BUSINESS_UNITS, REGIONS,
  type AccessContext, type Brand, type Dim, type Grain, type MetricDef, type MetricId, type MetricQuery,
  type MetricResult, type MetricRow, type Provenance, type Region,
} from "@/lib/contracts";
import { METRIC_LIST, TIME_DIMS, findMetric, metricDef } from "@/lib/semantic/metrics";
import { displayLabel, resolveDimValue, resolveEntities, resolveEntity } from "@/lib/semantic/dictionary";
import {
  financeTables, forecastAccuracyTables, hrTables, inventoryTables, marketingTables, productionTables, salesCube,
} from "./cache";
import { INJECTED_ANOMALIES } from "./anomalies";
import {
  DAY_COUNT, ISO_OF_DAY, MONTH_COUNT, MONTH_KEYS, MONTH_OF_DAY, TODAY, WEEK_COUNT, WEEK_KEYS, WEEK_OF_DAY,
  formatThaiDate, toDayIndex,
} from "./dates";
import { AGENTS, agentById } from "./entities/agents";
import { CHANNELS } from "./entities/channels";
import { DEPARTMENTS } from "./entities/hr";
import { CAMPAIGNS, campaignById } from "./entities/marketing";
import { BUSINESS_UNIT_LABELS_TH, PROVINCES, REGION_LABELS_TH } from "./entities/org";
import { BRAND_INFO, PACKS, SKUS, skuById } from "./entities/products";
import { DISTRIBUTION_CENTERS, PLANTS, PLANT_BRAND_MIX, PRODUCTION_LINES, dcById } from "./entities/supply";
import { findUser } from "./entities/users";
import {
  AGENT_COUNT, AGENT_DC_INDEX, AGENT_PROVINCE_INDEX, AGENT_REGION_INDEX, BRAND_COUNT, CAMPAIGN_COUNT, CHANNEL_COUNT,
  DC_COUNT, DEPARTMENT_COUNT, LINE_COUNT, MONTH_DAY_COUNTS, REGION_COUNT, SKU_BRAND_INDEX, SKU_BU_INDEX,
  SKU_COUNT, SKU_HL_PER_CASE, SKU_PACK_INDEX, SKU_PRICE_PER_CASE, channelShare, cubeIndex,
} from "./generator";

const DEFAULT_LIMIT = 60;
const MAX_GROUPS = 4_000_000;
const PREV_YEAR_DAYS = 364;
const PERCENT = 100;

type Failure = { ok: false; error: string; code: "PERMISSION_DENIED" | "UNKNOWN_METRIC" | "BAD_QUERY" };
type Filters = Map<Dim, Set<string>>;
type AxisSpec = { count: number; dims: Dim[]; valueOf: (index: number, dim: Dim) => string };
type AxisPlan = { size: number; codes: Int32Array; values: string[][]; dims: Dim[]; allow: Uint8Array | null; stride: number };

function fail(code: Failure["code"], error: string): Failure {
  return { ok: false, error, code };
}

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

type Shift = { days: number; months: number };

const NO_SHIFT: Shift = { days: 0, months: 0 };

function clampMonth(index: number): number {
  if (index < 0) return 0;
  if (index > MONTH_COUNT - 1) return MONTH_COUNT - 1;
  return index;
}

function monthLabelOfDay(dayIndex: number, shift: Shift): string {
  return MONTH_KEYS[clampMonth(MONTH_OF_DAY[clampDay(dayIndex + shift.days)] + shift.months)];
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

const MONTH_FIRST_DAY = (() => {
  const table = new Int32Array(MONTH_COUNT).fill(-1);
  for (let day = 0; day < DAY_COUNT; day += 1) {
    const month = MONTH_OF_DAY[day];
    if (table[month] === -1) table[month] = day;
  }
  return table;
})();

const WEEK_MIDDLE_DAY = (() => {
  const table = new Int32Array(WEEK_COUNT);
  const counts = new Int32Array(WEEK_COUNT);
  for (let day = 0; day < DAY_COUNT; day += 1) {
    const week = WEEK_OF_DAY[day];
    if (counts[week] === 0) table[week] = day;
    counts[week] += 1;
  }
  for (let week = 0; week < WEEK_COUNT; week += 1) table[week] = Math.min(DAY_COUNT - 1, table[week] + Math.floor(counts[week] / 2));
  return table;
})();

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
  return SKU_HL_PER_CASE[skuIdx];
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
          const output = tables.outputHl[offset + dayIdx];
          const capacity = tables.capacityHl[offset + dayIdx];
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

function sovShape(shift: Shift): Shape {
  return {
  axes: [BRAND_AXIS, weekAxis(shift)],
  scan: (plans, acc, from, to) => {
    const tables = marketingTables();
    const [brandPlan, weekPlan] = plans;
    const firstWeek = WEEK_OF_DAY[from];
    const lastWeek = WEEK_OF_DAY[to];
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
    for (let agentIdx = 0; agentIdx < AGENT_COUNT; agentIdx += 1) {
      if (agentPlan.allow && agentPlan.allow[agentIdx] === 0) continue;
      const agentCode = agentPlan.codes[agentIdx] * agentPlan.stride;
      for (let monthIdx = firstMonth; monthIdx <= lastMonth; monthIdx += 1) {
        if (monthPlan.allow && monthPlan.allow[monthIdx] === 0) continue;
        const code = agentCode + monthPlan.codes[monthIdx] * monthPlan.stride;
        acc.numerator[code] += tables.arOverdueThb[agentIdx * MONTH_COUNT + monthIdx];
        acc.denominator[code] += 1;
      }
    }
  },
  };
}

type HrKind = "headcount" | "attrition_rate" | "avg_salary";

function hrShape(kind: HrKind, shift: Shift): Shape {
  return {
    axes: [DEPARTMENT_AXIS, monthAxis(shift)],
    scan: (plans, acc, from, to) => {
      const tables = hrTables();
      const [departmentPlan, monthPlan] = plans;
      const firstMonth = MONTH_OF_DAY[from];
      const lastMonth = MONTH_OF_DAY[to];
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
            acc.denominator[code] += 1;
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

const RATIO_METRICS: ReadonlySet<MetricId> = new Set<MetricId>([
  "target_attainment", "days_of_cover", "capacity_utilization", "forecast_mape",
  "campaign_uplift", "share_of_voice", "sentiment_score", "gross_margin", "attrition_rate", "avg_salary", "headcount",
]);

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
    default: return hrShape(metric as HrKind, shift);
  }
}

function targetShapeFor(metric: MetricId): Shape | null {
  if (metric === "net_sales_volume" || metric === "sell_out_volume") return salesShape("target_volume", NO_SHIFT);
  if (metric === "net_sales_value") return salesShape("target_value", NO_SHIFT);
  if (metric === "production_output") return productionShape("capacity", NO_SHIFT);
  return null;
}

type Aggregated = { key: string; dims: Record<Dim, string>; value: number };

function aggregate(shape: Shape, dims: Dim[], filters: Filters, from: number, to: number, ratio: boolean): Aggregated[] | Failure {
  const plans = shape.axes.map((axis) => planAxis(axis, dims, filters));
  const size = assignStrides(plans);
  if (size > MAX_GROUPS) return fail("BAD_QUERY", "มิติที่ขอกว้างเกินไป กรุณาลดจำนวนมิติหรือช่วงเวลา");
  const acc = accumulator(size);
  shape.scan(plans, acc, from, to);
  const rows: Aggregated[] = [];
  for (let code = 0; code < size; code += 1) {
    const numerator = acc.numerator[code];
    const denominator = acc.denominator[code];
    if (numerator === 0 && denominator === 0) continue;
    const value = ratio ? (denominator === 0 ? 0 : numerator / denominator) : numerator;
    const dimValues = decode(plans, code);
    rows.push({ key: dims.map((dim) => dimValues[dim]).join("\u0001"), dims: dimValues, value });
  }
  return rows;
}

function scopeRegions(access: AccessContext): Region[] | null {
  return access.regions === "all" ? null : [...access.regions];
}

function scopeBrands(access: AccessContext): Brand[] | null {
  return access.brands === "all" ? null : [...access.brands];
}

function regionOfDimValue(dim: Dim, value: string): Region | null {
  if (dim === "region") return REGIONS.includes(value as Region) ? (value as Region) : null;
  if (dim === "province") return PROVINCES.find((province) => province.id === value)?.region ?? null;
  if (dim === "agent") return agentById(value)?.region ?? null;
  if (dim === "dc") return dcById(value)?.region ?? null;
  if (dim === "plant") return PLANTS.find((plant) => plant.id === value)?.region ?? null;
  return null;
}

function brandOfDimValue(dim: Dim, value: string): Brand | null {
  if (dim === "brand") return BRANDS.includes(value as Brand) ? (value as Brand) : null;
  if (dim === "sku") return skuById(value)?.brand ?? null;
  return null;
}

function normalizeFilters(query: MetricQuery, def: MetricDef): Filters | Failure {
  const filters: Filters = new Map();
  for (const [dim, values] of Object.entries(query.filters) as [Dim, string[] | undefined][]) {
    if (!values || values.length === 0) continue;
    if (!def.dims.includes(dim)) return fail("BAD_QUERY", `ตัวกรอง ${dim} ใช้กับเมตริก ${def.id} ไม่ได้`);
    const resolved = new Set<string>();
    for (const value of values) {
      const id = resolveDimValue(dim, value);
      if (!id) return fail("BAD_QUERY", `ไม่รู้จักค่า "${value}" ของมิติ ${dim}`);
      resolved.add(id);
    }
    filters.set(dim, resolved);
  }
  return filters;
}

function applyScope(filters: Filters, def: MetricDef, access: AccessContext): { scopeApplied: Partial<Record<Dim, string[]>> } | Failure {
  const scopeApplied: Partial<Record<Dim, string[]>> = {};
  const regions = scopeRegions(access);
  if (regions) {
    for (const dim of def.aclDims) {
      const values = filters.get(dim);
      if (!values) continue;
      for (const value of values) {
        const region = regionOfDimValue(dim, value);
        if (region && !regions.includes(region)) {
          return fail("PERMISSION_DENIED", `คุณไม่มีสิทธิ์ดูข้อมูลของ ${displayLabel(dim, value)} (นอกขอบเขตภาคที่รับผิดชอบ)`);
        }
      }
    }
    if (def.dims.includes("region") && !filters.has("region")) {
      filters.set("region", new Set(regions));
      scopeApplied.region = [...regions];
    }
  }
  const brands = scopeBrands(access);
  if (brands) {
    for (const dim of def.aclDims) {
      const values = filters.get(dim);
      if (!values) continue;
      for (const value of values) {
        const brand = brandOfDimValue(dim, value);
        if (brand && !brands.includes(brand)) {
          return fail("PERMISSION_DENIED", `คุณไม่มีสิทธิ์ดูข้อมูลของแบรนด์ ${displayLabel(dim, value)}`);
        }
      }
    }
    if (def.dims.includes("brand") && !filters.has("brand")) {
      filters.set("brand", new Set(brands));
      scopeApplied.brand = [...brands];
    }
  }
  return { scopeApplied };
}

function roundValue(format: MetricDef["format"], value: number): number {
  if (format === "currency") return Math.round(value);
  if (format === "percent") return Math.round(value * 10) / 10;
  return Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 100) / 100;
}

function formatNumber(value: number, fractionDigits: number): string {
  return new Intl.NumberFormat("th-TH", { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(value);
}

function formatForSummary(def: MetricDef, value: number): string {
  if (def.format === "percent") return `${formatNumber(value, 1)}%`;
  if (def.format === "currency") {
    if (Math.abs(value) >= 1_000_000) return `${formatNumber(value / 1_000_000, 1)} ล้านบาท`;
    return `${formatNumber(Math.round(value), 0)} บาท`;
  }
  const digits = Math.abs(value) >= 100 ? 0 : 1;
  return `${formatNumber(value, digits)} ${def.unit}`;
}

function firstTimeDim(dims: Dim[]): Dim | null {
  return dims.find((dim) => TIME_DIMS.includes(dim)) ?? null;
}

function sortRows(rows: Aggregated[], dims: Dim[], limit: number, masked: boolean): Aggregated[] {
  const timeDim = firstTimeDim(dims);
  if (masked && !timeDim) {
    return [...rows].sort((left, right) => left.key.localeCompare(right.key)).slice(0, limit);
  }
  if (!timeDim) {
    return [...rows].sort((left, right) => right.value - left.value).slice(0, limit);
  }
  const sorted = [...rows].sort((left, right) => (left.dims[timeDim] < right.dims[timeDim] ? -1 : left.dims[timeDim] > right.dims[timeDim] ? 1 : right.value - left.value));
  return sorted.length > limit ? sorted.slice(sorted.length - limit) : sorted;
}

function rangeDays(query: MetricQuery): { from: number; to: number } | Failure {
  const from = toDayIndex(query.range.from);
  const to = toDayIndex(query.range.to);
  if (Number.isNaN(from) || Number.isNaN(to)) return fail("BAD_QUERY", "ช่วงวันที่ไม่ถูกต้อง");
  if (to < from) return fail("BAD_QUERY", "วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น");
  const clampedFrom = Math.max(0, Math.min(DAY_COUNT - 1, from));
  const clampedTo = Math.max(0, Math.min(DAY_COUNT - 1, to));
  return { from: clampedFrom, to: clampedTo };
}

function indexCompare(rows: Aggregated[]): Map<string, number> {
  const table = new Map<string, number>();
  for (const row of rows) table.set(row.key, (table.get(row.key) ?? 0) + row.value);
  return table;
}

function buildRows(def: MetricDef, dims: Dim[], rows: Aggregated[], compareRows: Aggregated[] | null, masked: boolean): MetricRow[] {
  const compareIndex = compareRows ? indexCompare(compareRows) : null;
  return rows.map((row) => {
    const out: MetricRow = {};
    for (const dim of dims) out[dim] = TIME_DIMS.includes(dim) ? row.dims[dim] : displayLabel(dim, row.dims[dim]);
    if (masked) {
      out.value = "***";
      if (compareIndex) {
        out.compare_value = "***";
        out.delta_pct = "***";
      }
      return out;
    }
    out.value = roundValue(def.format, row.value);
    if (!compareIndex) return out;
    const previous = compareIndex.get(row.key);
    if (previous === undefined) {
      out.compare_value = null;
      out.delta_pct = null;
      return out;
    }
    out.compare_value = roundValue(def.format, previous);
    out.delta_pct = previous === 0 ? null : Math.round(((row.value - previous) / Math.abs(previous)) * 1000) / 10;
    return out;
  });
}

function summarize(def: MetricDef, query: MetricQuery, rows: Aggregated[], all: Aggregated[], ratio: boolean, compareRows: Aggregated[] | null, masked: boolean): string {
  const span = `${formatThaiDate(query.range.from)} – ${formatThaiDate(query.range.to)}`;
  if (masked) return `${def.labelTh} ${span}: ข้อมูลถูกปิดตามนโยบาย (masked) — เห็นได้เฉพาะโครงสร้างข้อมูล`;
  if (all.length === 0) return `${def.labelTh} ${span}: ไม่พบข้อมูลตามเงื่อนไขที่ขอ`;
  const totals = all.reduce((sum, row) => sum + row.value, 0);
  const headline = ratio
    ? `เฉลี่ย ${formatForSummary(def, totals / all.length)}`
    : `รวม ${formatForSummary(def, totals)}`;
  const parts = [`${def.labelTh} ${span}: ${headline}`];
  const nonTimeDim = query.dims.find((dim) => !TIME_DIMS.includes(dim));
  if (nonTimeDim) {
    const ranked = [...all].sort((left, right) => right.value - left.value).slice(0, 3);
    const top = ranked.map((row) => `${displayLabel(nonTimeDim, row.dims[nonTimeDim])} ${formatForSummary(def, row.value)}`);
    if (top.length > 0) parts.push(`สูงสุด: ${top.join(" · ")}`);
  }
  if (compareRows && compareRows.length > 0) {
    const previous = compareRows.reduce((sum, row) => sum + row.value, 0);
    const base = ratio ? previous / compareRows.length : previous;
    const current = ratio ? totals / all.length : totals;
    if (base !== 0) {
      const delta = ((current - base) / Math.abs(base)) * PERCENT;
      parts.push(`เทียบช่วงก่อนหน้า ${delta >= 0 ? "+" : ""}${formatNumber(Math.round(delta * 10) / 10, 1)}%`);
    }
  }
  parts.push(`(${rows.length} แถว · ${def.certified ? "certified" : "derived"} · ${def.sourceSystem})`);
  return parts.join(" · ");
}

function compareRange(query: MetricQuery, from: number, to: number): { from: number; to: number; shift: Shift } | null {
  if (query.compare === "prev_year") {
    if (to - PREV_YEAR_DAYS < 0) return null;
    return { from: Math.max(0, from - PREV_YEAR_DAYS), to: to - PREV_YEAR_DAYS, shift: { days: PREV_YEAR_DAYS, months: 0 } };
  }
  if (query.compare !== "prev_period") return null;
  if (query.grain === "month") {
    const firstMonth = MONTH_OF_DAY[from];
    const months = MONTH_OF_DAY[to] - firstMonth + 1;
    if (firstMonth - months < 0) return null;
    return { from: MONTH_FIRST_DAY[firstMonth - months], to: MONTH_FIRST_DAY[firstMonth] - 1, shift: { days: 0, months } };
  }
  const length = to - from + 1;
  if (to - length < 0) return null;
  return { from: Math.max(0, from - length), to: to - length, shift: { days: length, months: 0 } };
}

/** Runs one certified metric query under the caller's access scope. */
export function runMetric(query: MetricQuery, access: AccessContext): MetricResult {
  const def = metricDef(query.metric);
  if (!def) return fail("UNKNOWN_METRIC", `ไม่รู้จักเมตริก "${query.metric}"`);
  const visibility = access.metricAcl[def.id] ?? "none";
  if (visibility === "none") return fail("PERMISSION_DENIED", `บทบาทของคุณไม่มีสิทธิ์ดูเมตริก ${def.labelTh}`);
  const unknownDim = query.dims.find((dim) => !def.dims.includes(dim));
  if (unknownDim) return fail("BAD_QUERY", `มิติ ${unknownDim} ใช้กับเมตริก ${def.id} ไม่ได้`);

  const range = rangeDays(query);
  if ("ok" in range) return range;
  const filters = normalizeFilters(query, def);
  if ("ok" in filters) return filters;
  const scope = applyScope(filters, def, access);
  if ("ok" in scope) return scope;

  const dims = dedupe(query.dims);
  const ratio = RATIO_METRICS.has(def.id);
  const aggregated = aggregate(shapeFor(def.id, NO_SHIFT), dims, filters, range.from, range.to, ratio);
  if ("ok" in aggregated) return aggregated;

  let compareRows: Aggregated[] | null = null;
  if (query.compare === "target") {
    const targetShape = targetShapeFor(def.id);
    if (!targetShape) return fail("BAD_QUERY", `เมตริก ${def.id} ไม่มีเป้าหมายให้เทียบ`);
    const targets = aggregate(targetShape, dims, filters, range.from, range.to, false);
    if ("ok" in targets) return targets;
    compareRows = targets;
  } else if (query.compare !== "none") {
    const previous = compareRange(query, range.from, range.to);
    if (previous) {
      const rows = aggregate(shapeFor(def.id, previous.shift), dims, filters, previous.from, previous.to, ratio);
      if ("ok" in rows) return rows;
      compareRows = rows;
    }
  }

  const masked = visibility === "masked";
  const limit = query.limit ?? DEFAULT_LIMIT;
  const capped = sortRows(aggregated, dims, limit, masked);
  const cappedCompare = compareRows ? sortRows(compareRows, dims, limit, masked) : null;
  const rows = buildRows(def, dims, capped, cappedCompare, masked);
  const provenance: Provenance = {
    metric: def.id,
    certified: def.certified,
    sourceSystem: def.sourceSystem,
    asOf: TODAY,
    rowCount: rows.length,
    filtersApplied: filtersToRecord(filters, scope.scopeApplied),
    scopeApplied: scope.scopeApplied,
    masked: masked ? ["value", "compare_value", "delta_pct"] : [],
    trust: def.certified ? "verified" : "derived",
  };
  return { ok: true, rows, summary: summarize(def, query, capped, aggregated, ratio, cappedCompare, masked), provenance };
}

function dedupe(dims: Dim[]): Dim[] {
  return [...new Set(dims)];
}

function filtersToRecord(filters: Filters, scopeApplied: Partial<Record<Dim, string[]>>): Partial<Record<Dim, string[]>> {
  const out: Partial<Record<Dim, string[]>> = {};
  for (const [dim, values] of filters) {
    if (scopeApplied[dim]) continue;
    out[dim] = [...values];
  }
  return out;
}

/** Metric registry entries matching free text, or all of them when search is null. */
export function listMetrics(search: string | null): MetricDef[] {
  if (!search || search.trim() === "") return [...METRIC_LIST];
  return findMetric(search);
}

type DescribeResult = { ok: true; data: Record<string, unknown>; summary: string } | { ok: false; error: string };

function describeAgent(id: string): DescribeResult {
  const agent = agentById(id);
  if (!agent) return { ok: false, error: `ไม่พบเอเย่นต์ "${id}"` };
  const dc = dcById(agent.servingDc);
  const province = PROVINCES.find((entry) => entry.id === agent.provinceId);
  const data = {
    id: agent.id,
    ชื่อ: agent.nameTh,
    จังหวัด: province?.nameTh ?? agent.provinceId,
    ภาค: REGION_LABELS_TH[agent.region],
    เกรด: agent.tier,
    เครดิต: `${agent.creditDays} วัน`,
    เป็นคู่ค้าตั้งแต่: agent.sinceYear,
    ศูนย์กระจายสินค้า: dc?.nameTh ?? agent.servingDc,
    น้ำหนักยอดขาย: agent.weight,
  };
  return { ok: true, data, summary: `${agent.nameTh} เอเย่นต์เกรด ${agent.tier} จังหวัด${province?.nameTh ?? ""} ${REGION_LABELS_TH[agent.region]} เครดิต ${agent.creditDays} วัน ส่งจาก${dc?.nameTh ?? ""}` };
}

function describeSku(id: string): DescribeResult {
  const sku = skuById(id);
  if (!sku) return { ok: false, error: `ไม่พบสินค้า "${id}"` };
  const brand = BRAND_INFO.find((info) => info.id === sku.brand);
  const data = {
    id: sku.id,
    ชื่อ: sku.nameTh,
    แบรนด์: brand?.nameTh ?? sku.brand,
    หน่วยธุรกิจ: BUSINESS_UNIT_LABELS_TH[brand?.businessUnit ?? "beer"],
    บรรจุภัณฑ์: sku.pack,
    เฮกโตลิตรต่อลัง: sku.hlPerCase,
    ราคาต่อลัง: sku.pricePerCase,
    ภาษีสรรพสามิต: sku.excise ? "มี" : "ไม่มี",
  };
  return { ok: true, data, summary: `${sku.nameTh} แบรนด์${brand?.nameTh ?? sku.brand} ${sku.hlPerCase} เฮกโตลิตรต่อลัง ราคา ${sku.pricePerCase} บาทต่อลัง` };
}

function describeDc(id: string): DescribeResult {
  const dc = dcById(id);
  if (!dc) return { ok: false, error: `ไม่พบศูนย์กระจายสินค้า "${id}"` };
  const served = AGENTS.filter((agent) => agent.servingDc === dc.id);
  const data = {
    id: dc.id,
    ชื่อ: dc.nameTh,
    ภาค: REGION_LABELS_TH[dc.region],
    ความจุ: `${dc.capacityCases.toLocaleString("th-TH")} ลัง`,
    จำนวนเอเย่นต์ที่ให้บริการ: served.length,
    เอเย่นต์: served.map((agent) => agent.nameTh),
  };
  return { ok: true, data, summary: `${dc.nameTh} ${REGION_LABELS_TH[dc.region]} ความจุ ${dc.capacityCases.toLocaleString("th-TH")} ลัง ให้บริการเอเย่นต์ ${served.length} ราย` };
}

function describeCampaign(id: string): DescribeResult {
  const campaign = campaignById(id);
  if (!campaign) return { ok: false, error: `ไม่พบแคมเปญ "${id}"` };
  const owner = findUser(campaign.ownerUserId);
  const data = {
    id: campaign.id,
    ชื่อ: campaign.nameTh,
    ช่วงเวลา: `${campaign.from} – ${campaign.to}`,
    แบรนด์: campaign.brands.map((brand) => BRAND_INFO.find((info) => info.id === brand)?.nameTh ?? brand),
    ภาค: campaign.regions === "all" ? "ทั่วประเทศ" : campaign.regions.map((region) => REGION_LABELS_TH[region]),
    งบประมาณ: campaign.spendThb,
    เป้าหมายยอดเพิ่ม: `${Math.round(campaign.upliftTarget * PERCENT)}%`,
    ผู้รับผิดชอบ: owner?.nameTh ?? campaign.ownerUserId,
  };
  return { ok: true, data, summary: `${campaign.nameTh} ${campaign.from} ถึง ${campaign.to} งบ ${(campaign.spendThb / 1_000_000).toFixed(1)} ล้านบาท ดูแลโดย ${owner?.nameTh ?? campaign.ownerUserId}` };
}

function describeUser(id: string): DescribeResult {
  const user = findUser(id);
  if (!user) return { ok: false, error: `ไม่พบผู้ใช้ "${id}"` };
  const manager = user.managerId ? findUser(user.managerId) : null;
  const data = {
    id: user.id,
    ชื่อ: user.nameTh,
    ตำแหน่ง: user.title,
    ฝ่าย: user.department,
    บทบาท: user.role,
    ภาค: user.region ? REGION_LABELS_TH[user.region] : "ทั่วประเทศ",
    หัวหน้า: manager?.nameTh ?? "-",
    อีเมล: user.email,
  };
  return { ok: true, data, summary: `${user.nameTh} ${user.title} ฝ่าย${user.department}${user.region ? ` ${REGION_LABELS_TH[user.region]}` : ""}` };
}

/** Reference data for one entity, resolved from Thai free text. */
export function describeEntity(kind: "agent" | "sku" | "dc" | "campaign" | "user", query: string): DescribeResult {
  const matches = resolveEntities(kind, query);
  const id = matches[0]?.id ?? resolveEntity(kind, query)?.id ?? null;
  if (!id) return { ok: false, error: `ไม่พบ ${kind} ที่ตรงกับ "${query}"` };
  if (kind === "agent") return describeAgent(id);
  if (kind === "sku") return describeSku(id);
  if (kind === "dc") return describeDc(id);
  if (kind === "campaign") return describeCampaign(id);
  return describeUser(id);
}

export { INJECTED_ANOMALIES };
