import type { Dim, MetricId } from "@/lib/contracts";
import { DAY_COUNT, toDayIndex } from "./dates";
import { AGENT_INDEX } from "./entities/agents";
import { SKU_INDEX } from "./entities/products";

export type AnomalyEffect = { kind: "multiplier"; value: number } | { kind: "cover_days"; value: number };
export type InjectedAnomaly = {
  id: string;
  description: string;
  metric: MetricId;
  dims: Partial<Record<Dim, string>>;
  extraDims: Record<string, string>;
  window: { from: string; to: string };
  direction: "up" | "down";
  effect: AnomalyEffect;
  explainedBy: string | null;
};

export const INJECTED_ANOMALIES: readonly InjectedAnomaly[] = [
  {
    id: "anom_rungrueang_leo620",
    description: "เอเย่นต์ ส.รุ่งเรือง เทรดดิ้ง (บุรีรัมย์) สั่ง ลีโอ ขวด 620 ลดลง 34% ต่อเนื่อง 3 สัปดาห์ ขณะที่ยอดขายออกหน้าร้านทรงตัว",
    metric: "net_sales_volume",
    dims: { agent: "ag_nea_07", sku: "sku_leo_bottle620", province: "pv_buriram", region: "northeast" },
    extraDims: {},
    window: { from: "2026-09-02", to: "2026-09-22" },
    direction: "down",
    effect: { kind: "multiplier", value: 0.66 },
    explainedBy: null,
  },
  {
    id: "anom_purra_pm25_north",
    description: "ยอดขายออก เพอร์ร่า PET 600 ในเชียงใหม่และลำพูนเพิ่มขึ้น 28% ใน 5 วันล่าสุด สอดคล้องกับค่าฝุ่น PM2.5 ที่พุ่งสูง",
    metric: "sell_out_volume",
    dims: { sku: "sku_purra_pet600", region: "north" },
    extraDims: { provinces: "pv_chiangmai,pv_lamphun" },
    window: { from: "2026-09-18", to: "2026-09-22" },
    direction: "up",
    effect: { kind: "multiplier", value: 1.28 },
    explainedBy: "pm25",
  },
  {
    id: "anom_lamphun_purra_cover",
    description: "ศูนย์กระจายสินค้าลำพูน มีวันครอบคลุมสต๊อก เพอร์ร่า PET 600 เหลือ 6.2 วัน ต่ำกว่าเกณฑ์ 10 วัน",
    metric: "days_of_cover",
    dims: { dc: "dc_lamphun", sku: "sku_purra_pet600", region: "north" },
    extraDims: {},
    window: { from: "2026-09-13", to: "2026-09-22" },
    direction: "down",
    effect: { kind: "cover_days", value: 6.2 },
    explainedBy: null,
  },
  {
    id: "anom_northeast_silent_agents",
    description: "เอเย่นต์ 2 รายในภาคอีสาน (อีสานรุ่งโรจน์ ค้าส่ง, อุบลศรีสุข เทรดดิ้ง) หยุดสั่ง ลีโอ และ สิงห์ มา 12 วัน ทำให้ยอดภาคลดลงราว 12% เทียบสัปดาห์ก่อน",
    metric: "net_sales_volume",
    dims: { region: "northeast" },
    extraDims: { agents: "ag_nea_02,ag_nea_05", brands: "leo,singha" },
    window: { from: "2026-09-11", to: "2026-09-22" },
    direction: "down",
    effect: { kind: "multiplier", value: 0.04 },
    explainedBy: null,
  },
  {
    id: "anom_cstore_soda_promo",
    description: "โมเดิร์นเทรด ซีสโตร์ ยอด โซดาสิงห์ กระป๋อง 320 เพิ่มขึ้น 40% หลังโปรโมชัน 1 แถม 1",
    metric: "sell_out_volume",
    dims: { channel: "modern_trade", sku: "sku_singha_soda_can320" },
    extraDims: { chain: "chain_cstore", regions: "bkk,central" },
    window: { from: "2026-09-05", to: "2026-09-22" },
    direction: "up",
    effect: { kind: "multiplier", value: 1.4 },
    explainedBy: "cmp_cstore_soda_promo",
  },
  {
    id: "anom_south_ar_overdue",
    description: "ยอดค้างชำระเกินกำหนดของเอเย่นต์เกรด C 3 รายในภาคใต้พุ่งขึ้นราว 2.6 เท่าของเส้นฐานใน 2 เดือนล่าสุด",
    metric: "ar_overdue",
    dims: { region: "south" },
    extraDims: { agents: "ag_sou_02,ag_sou_05,ag_sou_06" },
    window: { from: "2026-08-01", to: "2026-09-22" },
    direction: "up",
    effect: { kind: "multiplier", value: 2.6 },
    explainedBy: null,
  },
  {
    id: "anom_khonkaen_line2",
    description: "โรงงานขอนแก่น สายการผลิต 2 ผลิตได้ลดลง 20% เป็นเวลา 4 วันจากการซ่อมบำรุง",
    metric: "production_output",
    dims: { plant: "pl_khonkaen", region: "northeast" },
    extraDims: { line: "pl_khonkaen_l2" },
    window: { from: "2026-09-14", to: "2026-09-17" },
    direction: "down",
    effect: { kind: "multiplier", value: 0.8 },
    explainedBy: "maintenance",
  },
];

export function anomalyById(id: string): InjectedAnomaly | null {
  return INJECTED_ANOMALIES.find((anomaly) => anomaly.id === id) ?? null;
}

export type DayWindow = { from: number; to: number };

export function windowDays(anomaly: InjectedAnomaly): DayWindow {
  return {
    from: Math.max(0, toDayIndex(anomaly.window.from)),
    to: Math.min(DAY_COUNT - 1, toDayIndex(anomaly.window.to)),
  };
}

function multiplierOf(anomaly: InjectedAnomaly): number {
  return anomaly.effect.kind === "multiplier" ? anomaly.effect.value : 1;
}

function splitIds(value: string | undefined): string[] {
  return value ? value.split(",") : [];
}

export type CubeRule = { skus: Set<number>; agents: Set<number>; window: DayWindow; multiplier: number };

function agentIndices(ids: string[]): Set<number> {
  const set = new Set<number>();
  for (const id of ids) {
    const index = AGENT_INDEX.get(id);
    if (index !== undefined) set.add(index);
  }
  return set;
}

function skuIndices(ids: string[]): Set<number> {
  const set = new Set<number>();
  for (const id of ids) {
    const index = SKU_INDEX.get(id);
    if (index !== undefined) set.add(index);
  }
  return set;
}

export function buildCubeRule(anomalyId: string, skuIds: string[], agentIds: string[]): CubeRule {
  const anomaly = anomalyById(anomalyId) as InjectedAnomaly;
  return { skus: skuIndices(skuIds), agents: agentIndices(agentIds), window: windowDays(anomaly), multiplier: multiplierOf(anomaly) };
}

export const ANOMALY_AGENT_IDS = {
  rungrueang: "ag_nea_07",
  silentNortheast: splitIds(anomalyById("anom_northeast_silent_agents")?.extraDims.agents),
  southOverdue: splitIds(anomalyById("anom_south_ar_overdue")?.extraDims.agents),
  purraNorthProvinces: splitIds(anomalyById("anom_purra_pm25_north")?.extraDims.provinces),
} as const;
