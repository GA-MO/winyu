import type { Region } from "@/lib/contracts";
import { PROVINCE_INDEX, PROVINCES, type Province } from "./org";

export type AgentTier = "A" | "B" | "C";
export type Agent = {
  id: string; nameTh: string; provinceId: string; region: Region; tier: AgentTier;
  creditDays: number; sinceYear: number; weight: number; servingDc: string;
};

type AgentSeed = { id: string; nameTh: string; provinceId: string; tier: AgentTier; creditDays: number; sinceYear: number; weight: number; servingDc: string };

const AGENT_SEEDS: readonly AgentSeed[] = [
  { id: "ag_bkk_01", nameTh: "กรุงไทยเบเวอเรจ", provinceId: "pv_bangkok", tier: "A", creditDays: 45, sinceYear: 1998, weight: 1.85, servingDc: "dc_bangkok" },
  { id: "ag_bkk_02", nameTh: "พระราม 4 ดิสทริบิวชั่น", provinceId: "pv_bangkok", tier: "A", creditDays: 45, sinceYear: 2003, weight: 1.62, servingDc: "dc_bangkok" },
  { id: "ag_bkk_03", nameTh: "สุวรรณชัย ค้าส่ง", provinceId: "pv_bangkok", tier: "B", creditDays: 30, sinceYear: 2011, weight: 1.08, servingDc: "dc_bangkok" },
  { id: "ag_bkk_04", nameTh: "นนท์เจริญพาณิชย์", provinceId: "pv_nonthaburi", tier: "B", creditDays: 30, sinceYear: 2009, weight: 0.94, servingDc: "dc_bangkok" },
  { id: "ag_bkk_05", nameTh: "ปทุมรุ่งกิจ เทรดดิ้ง", provinceId: "pv_pathumthani", tier: "B", creditDays: 30, sinceYear: 2013, weight: 0.88, servingDc: "dc_bangkok" },
  { id: "ag_bkk_06", nameTh: "รังสิตซัพพลาย", provinceId: "pv_pathumthani", tier: "C", creditDays: 21, sinceYear: 2018, weight: 0.52, servingDc: "dc_bangkok" },
  { id: "ag_bkk_07", nameTh: "สมุทรพรทวี", provinceId: "pv_samutprakan", tier: "B", creditDays: 30, sinceYear: 2007, weight: 1.02, servingDc: "dc_bangkok" },
  { id: "ag_bkk_08", nameTh: "บางพลีค้าส่ง", provinceId: "pv_samutprakan", tier: "C", creditDays: 21, sinceYear: 2019, weight: 0.46, servingDc: "dc_bangkok" },
  { id: "ag_cen_01", nameTh: "อยุธยาศรีทอง", provinceId: "pv_ayutthaya", tier: "A", creditDays: 45, sinceYear: 2001, weight: 1.34, servingDc: "dc_ayutthaya" },
  { id: "ag_cen_02", nameTh: "วังน้อยเบเวอเรจ", provinceId: "pv_ayutthaya", tier: "C", creditDays: 21, sinceYear: 2017, weight: 0.49, servingDc: "dc_ayutthaya" },
  { id: "ag_cen_03", nameTh: "สระบุรีพาณิชย์", provinceId: "pv_saraburi", tier: "B", creditDays: 30, sinceYear: 2010, weight: 0.86, servingDc: "dc_ayutthaya" },
  { id: "ag_cen_04", nameTh: "นครปฐมรุ่งทรัพย์", provinceId: "pv_nakhonpathom", tier: "B", creditDays: 30, sinceYear: 2006, weight: 0.97, servingDc: "dc_ayutthaya" },
  { id: "ag_cen_05", nameTh: "ราชบุรีสหมิตร", provinceId: "pv_ratchaburi", tier: "B", creditDays: 30, sinceYear: 2012, weight: 0.79, servingDc: "dc_ayutthaya" },
  { id: "ag_cen_06", nameTh: "บ้านโป่งค้าส่ง", provinceId: "pv_ratchaburi", tier: "C", creditDays: 21, sinceYear: 2020, weight: 0.41, servingDc: "dc_ayutthaya" },
  { id: "ag_nor_01", nameTh: "เชียงใหม่สหพาณิชย์", provinceId: "pv_chiangmai", tier: "A", creditDays: 45, sinceYear: 1999, weight: 1.28, servingDc: "dc_chiangmai" },
  { id: "ag_nor_02", nameTh: "ล้านนาเบเวอเรจ", provinceId: "pv_chiangmai", tier: "B", creditDays: 30, sinceYear: 2014, weight: 0.83, servingDc: "dc_chiangmai" },
  { id: "ag_nor_03", nameTh: "เชียงรายทองคำ", provinceId: "pv_chiangrai", tier: "B", creditDays: 30, sinceYear: 2008, weight: 0.74, servingDc: "dc_chiangmai" },
  { id: "ag_nor_04", nameTh: "ลำพูนรุ่งทรัพย์", provinceId: "pv_lamphun", tier: "B", creditDays: 30, sinceYear: 2011, weight: 0.68, servingDc: "dc_lamphun" },
  { id: "ag_nor_05", nameTh: "หริภุญชัย เทรดดิ้ง", provinceId: "pv_lamphun", tier: "C", creditDays: 21, sinceYear: 2019, weight: 0.39, servingDc: "dc_lamphun" },
  { id: "ag_nor_06", nameTh: "พิษณุโลกศรีเจริญ", provinceId: "pv_phitsanulok", tier: "B", creditDays: 30, sinceYear: 2005, weight: 0.81, servingDc: "dc_lamphun" },
  { id: "ag_nea_01", nameTh: "ขอนแก่นมหาชัย", provinceId: "pv_khonkaen", tier: "A", creditDays: 45, sinceYear: 1997, weight: 1.46, servingDc: "dc_khonkaen" },
  { id: "ag_nea_02", nameTh: "อีสานรุ่งโรจน์ ค้าส่ง", provinceId: "pv_khonkaen", tier: "B", creditDays: 30, sinceYear: 2010, weight: 0.92, servingDc: "dc_khonkaen" },
  { id: "ag_nea_03", nameTh: "โคราชสหภัณฑ์", provinceId: "pv_nakhonratchasima", tier: "A", creditDays: 45, sinceYear: 2000, weight: 1.39, servingDc: "dc_korat" },
  { id: "ag_nea_04", nameTh: "ปากช่องเบเวอเรจ", provinceId: "pv_nakhonratchasima", tier: "C", creditDays: 21, sinceYear: 2018, weight: 0.48, servingDc: "dc_korat" },
  { id: "ag_nea_05", nameTh: "อุบลศรีสุข เทรดดิ้ง", provinceId: "pv_ubonratchathani", tier: "B", creditDays: 30, sinceYear: 2009, weight: 0.87, servingDc: "dc_khonkaen" },
  { id: "ag_nea_06", nameTh: "วารินพาณิชย์", provinceId: "pv_ubonratchathani", tier: "C", creditDays: 21, sinceYear: 2016, weight: 0.53, servingDc: "dc_khonkaen" },
  { id: "ag_nea_07", nameTh: "ส.รุ่งเรือง เทรดดิ้ง", provinceId: "pv_buriram", tier: "A", creditDays: 45, sinceYear: 2004, weight: 1.22, servingDc: "dc_korat" },
  { id: "ag_nea_08", nameTh: "นางรองค้าส่ง", provinceId: "pv_buriram", tier: "B", creditDays: 30, sinceYear: 2013, weight: 0.71, servingDc: "dc_korat" },
  { id: "ag_est_01", nameTh: "ชลบุรีบูรพา เทรดดิ้ง", provinceId: "pv_chonburi", tier: "A", creditDays: 45, sinceYear: 2002, weight: 1.41, servingDc: "dc_chonburi" },
  { id: "ag_est_02", nameTh: "พัทยาซันไชน์ ซัพพลาย", provinceId: "pv_chonburi", tier: "B", creditDays: 30, sinceYear: 2012, weight: 1.06, servingDc: "dc_chonburi" },
  { id: "ag_est_03", nameTh: "ระยองศรีทวี", provinceId: "pv_rayong", tier: "B", creditDays: 30, sinceYear: 2008, weight: 0.89, servingDc: "dc_chonburi" },
  { id: "ag_est_04", nameTh: "มาบตาพุดค้าส่ง", provinceId: "pv_rayong", tier: "C", creditDays: 21, sinceYear: 2017, weight: 0.44, servingDc: "dc_chonburi" },
  { id: "ag_est_05", nameTh: "จันทบูรพาณิชย์", provinceId: "pv_chanthaburi", tier: "B", creditDays: 30, sinceYear: 2011, weight: 0.63, servingDc: "dc_chonburi" },
  { id: "ag_est_06", nameTh: "แปดริ้วรุ่งกิจ", provinceId: "pv_chachoengsao", tier: "C", creditDays: 21, sinceYear: 2019, weight: 0.42, servingDc: "dc_chonburi" },
  { id: "ag_sou_01", nameTh: "หาดใหญ่สหมิตร", provinceId: "pv_songkhla", tier: "A", creditDays: 45, sinceYear: 2000, weight: 1.24, servingDc: "dc_songkhla" },
  { id: "ag_sou_02", nameTh: "สงขลาทักษิณ เทรดดิ้ง", provinceId: "pv_songkhla", tier: "C", creditDays: 21, sinceYear: 2018, weight: 0.47, servingDc: "dc_songkhla" },
  { id: "ag_sou_03", nameTh: "ภูเก็ตอันดามัน ซัพพลาย", provinceId: "pv_phuket", tier: "A", creditDays: 45, sinceYear: 2006, weight: 1.16, servingDc: "dc_songkhla" },
  { id: "ag_sou_04", nameTh: "สุราษฎร์ศรีทอง", provinceId: "pv_suratthani", tier: "B", creditDays: 30, sinceYear: 2010, weight: 0.78, servingDc: "dc_songkhla" },
  { id: "ag_sou_05", nameTh: "เกาะสมุยเบเวอเรจ", provinceId: "pv_suratthani", tier: "C", creditDays: 21, sinceYear: 2021, weight: 0.51, servingDc: "dc_songkhla" },
  { id: "ag_sou_06", nameTh: "นครศรีรุ่งเจริญ", provinceId: "pv_nakhonsithammarat", tier: "C", creditDays: 21, sinceYear: 2015, weight: 0.57, servingDc: "dc_songkhla" },
];

function regionOfProvince(provinceId: string): Region {
  const index = PROVINCE_INDEX.get(provinceId);
  return (PROVINCES[index ?? 0] as Province).region;
}

export const AGENTS: readonly Agent[] = AGENT_SEEDS.map((seed) => ({ ...seed, region: regionOfProvince(seed.provinceId) }));
export const AGENT_INDEX: ReadonlyMap<string, number> = new Map(AGENTS.map((agent, index) => [agent.id, index]));

export function agentById(id: string): Agent | null {
  const index = AGENT_INDEX.get(id);
  return index === undefined ? null : (AGENTS[index] as Agent);
}

export function agentsOfRegion(region: Region): Agent[] {
  return AGENTS.filter((agent) => agent.region === region);
}

export const TIER_LABELS_TH: Record<AgentTier, string> = { A: "เกรด A", B: "เกรด B", C: "เกรด C" };
