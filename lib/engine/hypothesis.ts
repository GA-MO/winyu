import type { Dim, MetricId, Region } from "@/lib/contracts";
import { runSeries } from "@/lib/data/query";
import { CAMPAIGNS } from "@/lib/data/entities/marketing";
import { NORTHERN_PROVINCE_IDS, pm25Series } from "@/lib/data/entities/external";
import { agentById } from "@/lib/data/entities/agents";
import { provinceById } from "@/lib/data/entities/org";
import { PLANTS, dcById } from "@/lib/data/entities/supply";
import { skuById } from "@/lib/data/entities/products";
import { ISO_OF_DAY, addDays, toDayIndex } from "@/lib/data/dates";
import { OWN_MAKER } from "@/lib/data/entities/market";
import { GENERATOR_DICTIONARY } from "@/lib/data/master";
import { TH } from "@/lib/i18n/th";
import { pearson } from "./stats";

export type Explanation = { hypothesis: string; verifySteps: [string, string]; explained: boolean };

export type Context = {
  metric: MetricId;
  dims: Partial<Record<Dim, string>>;
  direction: "up" | "down";
  window: { from: string; to: string };
  observed: number;
  expected: number;
  region: Region | null;
  detail: string | null;
};

const PM25_CORRELATION = 0.6;
const FLAT_RATIO = 0.12;
const SILENT_SHARE = 0.25;
const COVER_DECIMALS = 1;
const SHARE_DECIMALS = 1;
const DAYS_PER_MONTH = 30;

function scopeLabel(dims: Partial<Record<Dim, string>>): string {
  const order: Dim[] = ["agent", "dc", "plant", "sku", "brand", "channel", "province", "region"];
  const parts = order
    .filter((dim) => dims[dim] && !(dim === "brand" && dims.sku))
    .map((dim) => GENERATOR_DICTIONARY.displayLabel(dim, dims[dim] as string));
  return parts.length > 0 ? parts.join(" · ") : TH.region.all;
}

function placeLabel(dims: Partial<Record<Dim, string>>): string {
  for (const dim of ["province", "dc", "plant", "region"] as Dim[]) {
    if (dims[dim]) return GENERATOR_DICTIONARY.displayLabel(dim, dims[dim] as string);
  }
  return TH.region.all;
}

function filtersOf(dims: Partial<Record<Dim, string>>): Partial<Record<Dim, string[]>> {
  return Object.fromEntries(Object.entries(dims).map(([dim, value]) => [dim, [value as string]]));
}

function totalOf(metric: MetricId, dims: Partial<Record<Dim, string>>, from: string, to: string): number {
  const rows = runSeries({ metric, dims: [], filters: filtersOf(dims), range: { from, to } });
  return rows[0]?.value ?? 0;
}

function priorWindow(window: { from: string; to: string }): { from: string; to: string } {
  const from = toDayIndex(window.from);
  const to = toDayIndex(window.to);
  const length = to - from + 1;
  const priorTo = Math.max(0, from - 1);
  const priorFrom = Math.max(0, priorTo - length + 1);
  return { from: ISO_OF_DAY[priorFrom] as string, to: ISO_OF_DAY[priorTo] as string };
}

function sellOutHeldFlat(context: Context): boolean {
  if (context.metric !== "net_sales_volume" || context.direction !== "down") return false;
  const prior = priorWindow(context.window);
  const recent = totalOf("sell_out_volume", context.dims, context.window.from, context.window.to);
  const before = totalOf("sell_out_volume", context.dims, prior.from, prior.to);
  if (before <= 0) return false;
  return Math.abs(recent / before - 1) <= FLAT_RATIO;
}

function nearlySilent(context: Context): boolean {
  return context.direction === "down" && context.expected > 0 && context.observed / context.expected <= SILENT_SHARE;
}

function pm25Match(context: Context): boolean {
  const province = context.dims.province;
  if (!province || !(NORTHERN_PROVINCE_IDS as readonly string[]).includes(province)) return false;
  const series = pm25Series(province);
  if (!series) return false;
  const from = Math.max(0, toDayIndex(context.window.from) - 21);
  const to = toDayIndex(context.window.to);
  const rows = runSeries({ metric: context.metric, dims: ["date"], filters: filtersOf(context.dims), range: { from: ISO_OF_DAY[from] as string, to: ISO_OF_DAY[to] as string } });
  const byDay = new Map(rows.map((row) => [row.dims.date as string, row.value]));
  const left: number[] = [];
  const right: number[] = [];
  for (let day = from; day <= to; day += 1) {
    left.push(byDay.get(ISO_OF_DAY[day] as string) ?? 0);
    right.push(series[day] ?? 0);
  }
  return pearson(left, right) >= PM25_CORRELATION;
}

function campaignCovering(context: Context): string | null {
  const brand = context.dims.brand ?? (context.dims.sku ? skuById(context.dims.sku)?.brand : null);
  const region = context.region;
  const overlap = CAMPAIGNS.find((campaign) => {
    if (campaign.to < context.window.from || campaign.from > context.window.to) return false;
    if (brand && !campaign.brands.includes(brand as never)) return false;
    if (region && campaign.regions !== "all" && !campaign.regions.includes(region)) return false;
    const channel = context.dims.channel;
    if (channel && campaign.channels !== "all" && !campaign.channels.includes(channel as never)) return false;
    return true;
  });
  return overlap ? overlap.nameTh : null;
}

function steps(first: string, second: string): [string, string] {
  return [first, second];
}

/** One hypothesis and two things to check, chosen from the metric, the direction and the context around the window. */
type ShareShift = { maker: string; points: number };

function shareShifts(context: Context): ShareShift[] {
  const months = Math.max(1, Math.round((toDayIndex(context.window.to) - toDayIndex(context.window.from) + 1) / DAYS_PER_MONTH));
  const before = { from: addDays(context.window.from, -months * DAYS_PER_MONTH), to: addDays(context.window.from, -1) };
  const filters = filtersOf(context.dims);
  const during = new Map(runSeries({ metric: "market_share", dims: ["maker"], filters, range: context.window }).map((row) => [row.dims.maker as string, row.value]));
  const earlier = new Map(runSeries({ metric: "market_share", dims: ["maker"], filters, range: before }).map((row) => [row.dims.maker as string, row.value]));
  return [...during].map(([maker, value]) => ({ maker, points: value - (earlier.get(maker) ?? value) }));
}

function shareExplanation(context: Context, place: string): Explanation {
  const shifts = shareShifts(context);
  const own = shifts.find((shift) => shift.maker === OWN_MAKER);
  const rival = shifts.filter((shift) => shift.maker !== OWN_MAKER).sort((left, right) => right.points - left.points)[0];
  const verifySteps = steps(TH.engine.verify.makersOfPlace(place), TH.engine.verify.sellOutLastYear(place));
  if (!own || !rival || rival.points <= 0) return { hypothesis: TH.engine.hypothesis.genericDown(TH.metric.market_share, place), verifySteps, explained: false };
  return {
    hypothesis: TH.engine.hypothesis.rivalGain(place, GENERATOR_DICTIONARY.displayLabel("maker", rival.maker), rival.points.toFixed(SHARE_DECIMALS), Math.abs(own.points).toFixed(SHARE_DECIMALS)),
    verifySteps,
    explained: false,
  };
}

export function explain(context: Context): Explanation {
  const scope = scopeLabel(context.dims);
  const place = placeLabel(context.dims);
  const promo = campaignCovering(context);

  if (context.metric === "market_share" && context.direction === "down") return shareExplanation(context, place);

  if (context.metric === "days_of_cover" && context.direction === "down") {
    return {
      hypothesis: TH.engine.hypothesis.lowCover(place, context.observed.toFixed(COVER_DECIMALS)),
      verifySteps: steps(TH.engine.verify.coverOfScope(scope), TH.engine.verify.forecastOfScope(scope)),
      explained: false,
    };
  }

  if (context.metric === "production_output" && context.direction === "down") {
    return {
      hypothesis: TH.engine.hypothesis.productionDown(context.detail ? `${place} ${context.detail}` : place),
      verifySteps: steps(TH.engine.verify.productionPlan(scope), TH.engine.verify.coverOfScope(place)),
      explained: false,
    };
  }

  if (context.metric === "ar_overdue" && context.direction === "up") {
    return {
      hypothesis: TH.engine.hypothesis.arUp(scope),
      verifySteps: steps(TH.engine.verify.arOfScope(scope), TH.engine.verify.orderHistory(scope)),
      explained: false,
    };
  }

  if (nearlySilent(context) && context.dims.agent) {
    return {
      hypothesis: TH.engine.hypothesis.silentAgent(GENERATOR_DICTIONARY.displayLabel("agent", context.dims.agent)),
      verifySteps: steps(TH.engine.verify.orderHistory(scope), TH.engine.verify.arOfScope(scope)),
      explained: false,
    };
  }

  if (sellOutHeldFlat(context)) {
    return {
      hypothesis: TH.engine.hypothesis.stockAtAgent(scope),
      verifySteps: steps(TH.engine.verify.compareSellInOut(scope), TH.engine.verify.coverOfScope(scope)),
      explained: false,
    };
  }

  if (context.direction === "up" && pm25Match(context)) {
    return {
      hypothesis: TH.engine.hypothesis.pm25(place),
      verifySteps: steps(TH.engine.verify.coverOfScope(scope), TH.engine.verify.forecastOfScope(scope)),
      explained: false,
    };
  }

  if (promo) {
    return {
      hypothesis: TH.engine.hypothesis.promotion(promo),
      verifySteps: steps(TH.engine.verify.campaignEffect(scope), TH.engine.verify.lastYear(scope)),
      explained: true,
    };
  }

  const what = TH.metric[context.metric];
  return {
    hypothesis: context.direction === "up" ? TH.engine.hypothesis.genericUp(what, place) : TH.engine.hypothesis.genericDown(what, place),
    verifySteps: steps(TH.engine.verify.neighbours(scope), TH.engine.verify.lastYear(scope)),
    explained: false,
  };
}

export function regionOfDims(dims: Partial<Record<Dim, string>>): Region | null {
  if (dims.region) return dims.region as Region;
  if (dims.province) return provinceById(dims.province)?.region ?? null;
  if (dims.agent) return agentById(dims.agent)?.region ?? null;
  if (dims.dc) return dcById(dims.dc)?.region ?? null;
  if (dims.plant) return PLANTS.find((plant) => plant.id === dims.plant)?.region ?? null;
  return null;
}

