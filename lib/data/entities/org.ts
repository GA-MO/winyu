import { BUSINESS_UNITS, REGIONS, type BusinessUnit, type Region } from "@/lib/contracts";

export type Province = { id: string; nameTh: string; region: Region };

export const REGION_LABELS_TH: Record<Region, string> = {
  bkk: "กรุงเทพฯ และปริมณฑล",
  central: "ภาคกลาง",
  north: "ภาคเหนือ",
  northeast: "ภาคอีสาน",
  east: "ภาคตะวันออก",
  south: "ภาคใต้",
};

export const BUSINESS_UNIT_LABELS_TH: Record<BusinessUnit, string> = {
  beer: "กลุ่มเบียร์",
  non_alcohol: "กลุ่มนอนแอลกอฮอล์",
  import: "กลุ่มนำเข้า",
};

export const PROVINCES: readonly Province[] = [
  { id: "pv_bangkok", nameTh: "กรุงเทพมหานคร", region: "bkk" },
  { id: "pv_nonthaburi", nameTh: "นนทบุรี", region: "bkk" },
  { id: "pv_pathumthani", nameTh: "ปทุมธานี", region: "bkk" },
  { id: "pv_samutprakan", nameTh: "สมุทรปราการ", region: "bkk" },
  { id: "pv_ayutthaya", nameTh: "พระนครศรีอยุธยา", region: "central" },
  { id: "pv_saraburi", nameTh: "สระบุรี", region: "central" },
  { id: "pv_nakhonpathom", nameTh: "นครปฐม", region: "central" },
  { id: "pv_ratchaburi", nameTh: "ราชบุรี", region: "central" },
  { id: "pv_chiangmai", nameTh: "เชียงใหม่", region: "north" },
  { id: "pv_chiangrai", nameTh: "เชียงราย", region: "north" },
  { id: "pv_lamphun", nameTh: "ลำพูน", region: "north" },
  { id: "pv_phitsanulok", nameTh: "พิษณุโลก", region: "north" },
  { id: "pv_khonkaen", nameTh: "ขอนแก่น", region: "northeast" },
  { id: "pv_nakhonratchasima", nameTh: "นครราชสีมา", region: "northeast" },
  { id: "pv_ubonratchathani", nameTh: "อุบลราชธานี", region: "northeast" },
  { id: "pv_buriram", nameTh: "บุรีรัมย์", region: "northeast" },
  { id: "pv_chonburi", nameTh: "ชลบุรี", region: "east" },
  { id: "pv_rayong", nameTh: "ระยอง", region: "east" },
  { id: "pv_chanthaburi", nameTh: "จันทบุรี", region: "east" },
  { id: "pv_chachoengsao", nameTh: "ฉะเชิงเทรา", region: "east" },
  { id: "pv_songkhla", nameTh: "สงขลา", region: "south" },
  { id: "pv_phuket", nameTh: "ภูเก็ต", region: "south" },
  { id: "pv_suratthani", nameTh: "สุราษฎร์ธานี", region: "south" },
  { id: "pv_nakhonsithammarat", nameTh: "นครศรีธรรมราช", region: "south" },
];

export const PROVINCE_INDEX: ReadonlyMap<string, number> = new Map(PROVINCES.map((province, index) => [province.id, index]));

export function provinceById(id: string): Province | null {
  const index = PROVINCE_INDEX.get(id);
  return index === undefined ? null : (PROVINCES[index] as Province);
}

export const REGION_INDEX: ReadonlyMap<Region, number> = new Map(REGIONS.map((region, index) => [region, index]));
export const BUSINESS_UNIT_INDEX: ReadonlyMap<BusinessUnit, number> = new Map(BUSINESS_UNITS.map((unit, index) => [unit, index]));
