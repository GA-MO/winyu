import type { Region } from "@/lib/contracts";

export type ProductionLine = { id: string; nameTh: string; capacityHlPerDay: number };
export type Plant = { id: string; nameTh: string; label: string; provinceId: string; region: Region; lines: ProductionLine[] };
export type DistributionCenter = { id: string; nameTh: string; label: string; provinceId: string; region: Region; capacityCases: number };
export type RawMaterial = { id: string; nameTh: string; label: string; leadTimeDays: number; unit: string };

export const PLANTS: readonly Plant[] = [
  {
    id: "pl_pathumthani", nameTh: "โรงงานปทุมธานี", label: "Pathum Thani", provinceId: "pv_pathumthani", region: "bkk",
    lines: [
      { id: "pl_pathumthani_l1", nameTh: "สายการผลิต 1", capacityHlPerDay: 3200 },
      { id: "pl_pathumthani_l2", nameTh: "สายการผลิต 2", capacityHlPerDay: 2800 },
      { id: "pl_pathumthani_l3", nameTh: "สายการผลิต 3", capacityHlPerDay: 2400 },
    ],
  },
  {
    id: "pl_khonkaen", nameTh: "โรงงานขอนแก่น", label: "Khon Kaen", provinceId: "pv_khonkaen", region: "northeast",
    lines: [
      { id: "pl_khonkaen_l1", nameTh: "สายการผลิต 1", capacityHlPerDay: 2600 },
      { id: "pl_khonkaen_l2", nameTh: "สายการผลิต 2", capacityHlPerDay: 2200 },
    ],
  },
  {
    id: "pl_singburi", nameTh: "โรงงานสิงห์บุรี", label: "Sing Buri", provinceId: "pv_saraburi", region: "central",
    lines: [
      { id: "pl_singburi_l1", nameTh: "สายการผลิต 1", capacityHlPerDay: 2400 },
      { id: "pl_singburi_l2", nameTh: "สายการผลิต 2", capacityHlPerDay: 2000 },
    ],
  },
];

export const PLANT_INDEX: ReadonlyMap<string, number> = new Map(PLANTS.map((plant, index) => [plant.id, index]));
export const PRODUCTION_LINES: readonly { plantIndex: number; plantId: string; line: ProductionLine }[] = PLANTS.flatMap(
  (plant, plantIndex) => plant.lines.map((line) => ({ plantIndex, plantId: plant.id, line })),
);

export const DISTRIBUTION_CENTERS: readonly DistributionCenter[] = [
  { id: "dc_bangkok", nameTh: "ศูนย์กระจายสินค้ากรุงเทพฯ", label: "DC Bangkok", provinceId: "pv_bangkok", region: "bkk", capacityCases: 420000 },
  { id: "dc_ayutthaya", nameTh: "ศูนย์กระจายสินค้าอยุธยา", label: "DC Ayutthaya", provinceId: "pv_ayutthaya", region: "central", capacityCases: 260000 },
  { id: "dc_chiangmai", nameTh: "ศูนย์กระจายสินค้าเชียงใหม่", label: "DC Chiang Mai", provinceId: "pv_chiangmai", region: "north", capacityCases: 180000 },
  { id: "dc_lamphun", nameTh: "ศูนย์กระจายสินค้าลำพูน", label: "DC Lamphun", provinceId: "pv_lamphun", region: "north", capacityCases: 120000 },
  { id: "dc_khonkaen", nameTh: "ศูนย์กระจายสินค้าขอนแก่น", label: "DC Khon Kaen", provinceId: "pv_khonkaen", region: "northeast", capacityCases: 300000 },
  { id: "dc_korat", nameTh: "ศูนย์กระจายสินค้านครราชสีมา", label: "DC Korat", provinceId: "pv_nakhonratchasima", region: "northeast", capacityCases: 210000 },
  { id: "dc_chonburi", nameTh: "ศูนย์กระจายสินค้าชลบุรี", label: "DC Chonburi", provinceId: "pv_chonburi", region: "east", capacityCases: 200000 },
  { id: "dc_songkhla", nameTh: "ศูนย์กระจายสินค้าสงขลา", label: "DC Songkhla", provinceId: "pv_songkhla", region: "south", capacityCases: 170000 },
];

export const DC_INDEX: ReadonlyMap<string, number> = new Map(DISTRIBUTION_CENTERS.map((dc, index) => [dc.id, index]));

export function dcById(id: string): DistributionCenter | null {
  const index = DC_INDEX.get(id);
  return index === undefined ? null : (DISTRIBUTION_CENTERS[index] as DistributionCenter);
}

export const RAW_MATERIALS: readonly RawMaterial[] = [
  { id: "rm_malt", nameTh: "มอลต์", label: "Malt", leadTimeDays: 45, unit: "ตัน" },
  { id: "rm_hops", nameTh: "ฮอปส์", label: "Hops", leadTimeDays: 60, unit: "กก." },
  { id: "rm_yeast", nameTh: "ยีสต์", label: "Yeast", leadTimeDays: 14, unit: "กก." },
  { id: "rm_glass", nameTh: "ขวดแก้ว", label: "Glass bottle", leadTimeDays: 21, unit: "ขวด" },
  { id: "rm_can", nameTh: "กระป๋องอะลูมิเนียม", label: "Aluminium can", leadTimeDays: 35, unit: "ใบ" },
  { id: "rm_carton", nameTh: "ลังกระดาษ", label: "Carton", leadTimeDays: 10, unit: "ใบ" },
];

/** Share of each plant's output that feeds each business unit. */
export const PLANT_BRAND_MIX: Record<string, Record<string, number>> = {
  pl_pathumthani: { singha: 0.32, leo: 0.3, singha_soda: 0.12, singha_water: 0.1, purra: 0.05, singha_lemon_soda: 0.05, asahi: 0.04, carlsberg: 0.02 },
  pl_khonkaen: { singha: 0.24, leo: 0.44, singha_soda: 0.1, singha_water: 0.09, purra: 0.06, singha_lemon_soda: 0.04, asahi: 0.02, carlsberg: 0.01 },
  pl_singburi: { singha: 0.28, leo: 0.26, singha_soda: 0.14, singha_water: 0.14, purra: 0.09, singha_lemon_soda: 0.06, asahi: 0.02, carlsberg: 0.01 },
};
