import { BUSINESS_UNITS, REGIONS, type Dim } from "@/lib/contracts";
import { AGENTS, TIER_LABELS_TH } from "@/lib/data/entities/agents";
import { CHANNELS, MODERN_TRADE_CHAINS } from "@/lib/data/entities/channels";
import { DEPARTMENTS } from "@/lib/data/entities/hr";
import { CAMPAIGNS } from "@/lib/data/entities/marketing";
import { BUSINESS_UNIT_LABELS_TH, PROVINCES, REGION_LABELS_TH } from "@/lib/data/entities/org";
import { BRAND_INFO, PACKS, PACK_LABELS_TH, SKUS } from "@/lib/data/entities/products";
import { MAKERS } from "@/lib/data/entities/market";
import { DISTRIBUTION_CENTERS, PLANTS } from "@/lib/data/entities/supply";
import { USERS } from "@/lib/data/entities/users";

export type EntityKind =
  | "agent" | "sku" | "dc" | "campaign" | "user" | "region" | "province"
  | "brand" | "channel" | "pack" | "plant" | "department" | "business_unit" | "chain" | "maker";

export type ResolvedEntity = { kind: EntityKind; id: string; label: string; score: number };

type Candidate = { id: string; label: string; terms: string[] };

const STRIP_PREFIXES = ["จังหวัด", "จ.", "อำเภอ", "อ.", "คุณ", "บริษัท", "หจก.", "ห้างหุ้นส่วน", "ภาค", "แบรนด์", "เอเย่นต์", "ตัวแทน"];
const AGENT_SUFFIXES = ["เทรดดิ้ง", "ค้าส่ง", "พาณิชย์", "ซัพพลาย", "เบเวอเรจ", "ดิสทริบิวชั่น", "สหมิตร", "สหพาณิชย์"];
const PACK_SIZE_TOKENS: Record<string, string[]> = {
  bottle620: ["620", "ขวดใหญ่", "ขวด 620"],
  bottle320: ["320 ขวด", "ขวดเล็ก", "ขวด 320"],
  can320: ["กระป๋อง 320", "320 กระป๋อง", "กระป๋องเล็ก"],
  can490: ["490", "กระป๋องใหญ่", "กระป๋อง 490"],
  keg30: ["เคก", "keg", "ถัง", "สด", "30 ลิตร"],
  pet600: ["600", "ขวดเล็ก pet", "pet 600"],
  pet1500: ["1.5", "1500", "ขวดใหญ่ pet"],
  pack12: ["แพ็ก 12", "แพ็ค 12", "12 กระป๋อง", "pack 12"],
};

function canon(text: string): string {
  let value = text.toLowerCase().trim();
  for (const prefix of STRIP_PREFIXES) {
    if (value.startsWith(prefix.toLowerCase())) value = value.slice(prefix.length);
  }
  return value.replace(/[\s._\-()"']/g, "");
}

function agentTerms(nameTh: string): string[] {
  const terms = [nameTh];
  for (const suffix of AGENT_SUFFIXES) {
    if (nameTh.endsWith(suffix)) terms.push(nameTh.slice(0, nameTh.length - suffix.length).trim());
  }
  return terms;
}

const REGION_ALIASES: Record<string, string[]> = {
  bkk: ["กรุงเทพ", "กรุงเทพฯ", "กทม", "กทม.", "บางกอก", "ปริมณฑล", "bangkok", "bkk", "กรุงเทพและปริมณฑล"],
  central: ["ภาคกลาง", "กลาง", "central"],
  north: ["ภาคเหนือ", "เหนือ", "ล้านนา", "north", "northern"],
  northeast: ["ภาคอีสาน", "อีสาน", "ภาคตะวันออกเฉียงเหนือ", "ตะวันออกเฉียงเหนือ", "northeast", "ne", "isan"],
  east: ["ภาคตะวันออก", "ตะวันออก", "east", "ชายฝั่งตะวันออก"],
  south: ["ภาคใต้", "ใต้", "south", "southern", "ปักษ์ใต้"],
};

const PROVINCE_ALIASES: Record<string, string[]> = {
  pv_bangkok: ["กทม", "กทม.", "กรุงเทพ", "กรุงเทพฯ", "บางกอก", "bangkok"],
  pv_nakhonratchasima: ["โคราช", "นครราชสีมา", "korat", "khorat"],
  pv_songkhla: ["หาดใหญ่", "สงขลา", "hatyai", "hat yai"],
  pv_ayutthaya: ["อยุธยา", "กรุงเก่า", "ayutthaya"],
  pv_chiangmai: ["เชียงใหม่", "เจียงใหม่", "chiangmai", "chiang mai"],
  pv_lamphun: ["ลำพูน", "หริภุญชัย", "lamphun"],
  pv_chiangrai: ["เชียงราย", "chiangrai"],
  pv_ubonratchathani: ["อุบล", "อุบลราชธานี", "ubon"],
  pv_buriram: ["บุรีรัมย์", "บุรีรัม", "buriram"],
  pv_khonkaen: ["ขอนแก่น", "khonkaen", "khon kaen"],
  pv_suratthani: ["สุราษฎร์", "สุราษฏร์ธานี", "สุราษฎร์ธานี", "surat"],
  pv_nakhonsithammarat: ["นครศรี", "นครศรีธรรมราช", "คอน"],
  pv_chonburi: ["ชลบุรี", "พัทยา", "chonburi", "pattaya"],
  pv_phuket: ["ภูเก็ต", "phuket"],
  pv_samutprakan: ["สมุทรปราการ", "ปากน้ำ"],
  pv_pathumthani: ["ปทุมธานี", "รังสิต"],
  pv_nonthaburi: ["นนทบุรี", "นนท์"],
  pv_nakhonpathom: ["นครปฐม"],
  pv_ratchaburi: ["ราชบุรี", "บ้านโป่ง"],
  pv_saraburi: ["สระบุรี"],
  pv_phitsanulok: ["พิษณุโลก", "สองแคว"],
  pv_rayong: ["ระยอง", "มาบตาพุด"],
  pv_chanthaburi: ["จันทบุรี", "จันท์"],
  pv_chachoengsao: ["ฉะเชิงเทรา", "แปดริ้ว"],
};

function skuTerms(skuId: string, brandId: string, pack: string, nameTh: string, label: string): string[] {
  const brand = BRAND_INFO.find((info) => info.id === brandId);
  const nicknames = brand ? [brand.nameTh, ...brand.nicknames] : [];
  const sizes = PACK_SIZE_TOKENS[pack] ?? [];
  const terms = [skuId, nameTh, label, PACK_LABELS_TH[pack as keyof typeof PACK_LABELS_TH] ?? pack];
  for (const nickname of nicknames) {
    terms.push(nickname);
    for (const size of sizes) terms.push(`${nickname} ${size}`);
  }
  return terms;
}

const CANDIDATES: Record<EntityKind, Candidate[]> = {
  agent: AGENTS.map((agent) => ({ id: agent.id, label: agent.nameTh, terms: [agent.id, ...agentTerms(agent.nameTh)] })),
  sku: SKUS.map((sku) => ({ id: sku.id, label: sku.nameTh, terms: skuTerms(sku.id, sku.brand, sku.pack, sku.nameTh, sku.label) })),
  dc: DISTRIBUTION_CENTERS.map((dc) => ({ id: dc.id, label: dc.nameTh, terms: [dc.id, dc.nameTh, dc.label, dc.nameTh.replace("ศูนย์กระจายสินค้า", "")] })),
  campaign: CAMPAIGNS.map((campaign) => ({ id: campaign.id, label: campaign.nameTh, terms: [campaign.id, campaign.nameTh, campaign.label] })),
  user: USERS.map((user) => ({ id: user.id, label: user.nameTh, terms: [user.id, user.name, user.nameTh, user.email, user.title] })),
  region: REGIONS.map((region) => ({ id: region, label: REGION_LABELS_TH[region], terms: [region, REGION_LABELS_TH[region], ...(REGION_ALIASES[region] ?? [])] })),
  province: PROVINCES.map((province) => ({ id: province.id, label: province.nameTh, terms: [province.id, province.nameTh, ...(PROVINCE_ALIASES[province.id] ?? [])] })),
  brand: BRAND_INFO.map((info) => ({ id: info.id, label: info.nameTh, terms: [info.id, info.nameTh, info.label, ...info.nicknames] })),
  channel: CHANNELS.map((channel) => ({ id: channel.id, label: channel.nameTh, terms: [channel.id, channel.nameTh, channel.label] })),
  pack: PACKS.map((pack) => ({ id: pack, label: PACK_LABELS_TH[pack], terms: [pack, PACK_LABELS_TH[pack], ...(PACK_SIZE_TOKENS[pack] ?? [])] })),
  plant: PLANTS.map((plant) => ({ id: plant.id, label: plant.nameTh, terms: [plant.id, plant.nameTh, plant.label, plant.nameTh.replace("โรงงาน", "")] })),
  department: DEPARTMENTS.map((department) => ({ id: department.id, label: department.nameTh, terms: [department.id, department.nameTh, department.label] })),
  business_unit: BUSINESS_UNITS.map((unit) => ({ id: unit, label: BUSINESS_UNIT_LABELS_TH[unit], terms: [unit, BUSINESS_UNIT_LABELS_TH[unit], unit.replace("_", " ")] })),
  chain: MODERN_TRADE_CHAINS.map((chain) => ({ id: chain.id, label: chain.nameTh, terms: [chain.id, chain.nameTh, chain.label] })),
  maker: MAKERS.map((maker) => ({ id: maker.id, label: maker.nameTh, terms: [maker.id, maker.nameTh, maker.label, ...maker.nicknames] })),
};

const LABELS = (() => {
  const table = {} as Record<EntityKind, Map<string, string>>;
  for (const kind of Object.keys(CANDIDATES) as EntityKind[]) {
    table[kind] = new Map(CANDIDATES[kind].map((entry) => [entry.id, entry.label]));
  }
  return table;
})();

function termScore(term: string, needle: string): number {
  const left = canon(term);
  if (!left || !needle) return 0;
  if (left === needle) return 100;
  if (needle.includes(left) && left.length >= 3) return 40 + left.length;
  if (left.includes(needle) && needle.length >= 3) return 20 + needle.length;
  return 0;
}

/** Best entity of that kind for free text, tolerant of Thai spelling variants and nicknames. */
export function resolveEntity(kind: EntityKind, text: string): ResolvedEntity | null {
  return resolveEntities(kind, text)[0] ?? null;
}

export function resolveEntities(kind: EntityKind, text: string): ResolvedEntity[] {
  const needle = canon(text);
  if (!needle) return [];
  const matches: ResolvedEntity[] = [];
  for (const candidate of CANDIDATES[kind]) {
    let best = 0;
    for (const term of candidate.terms) best = Math.max(best, termScore(term, needle));
    if (best > 0) matches.push({ kind, id: candidate.id, label: candidate.label, score: best });
  }
  return matches.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
}

const DIM_KINDS: Partial<Record<Dim, EntityKind>> = {
  region: "region", province: "province", channel: "channel", brand: "brand", sku: "sku",
  pack: "pack", agent: "agent", dc: "dc", plant: "plant", campaign: "campaign",
  department: "department", business_unit: "business_unit", maker: "maker",
};

export function entityKindOfDim(dim: Dim): EntityKind | null {
  return DIM_KINDS[dim] ?? null;
}

/** Turns a filter value the model typed into the canonical entity id. */
export function resolveDimValue(dim: Dim, value: string): string | null {
  const kind = entityKindOfDim(dim);
  if (!kind) return value;
  if (LABELS[kind].has(value)) return value;
  return resolveEntity(kind, value)?.id ?? null;
}

export function displayLabel(dim: Dim, id: string): string {
  const kind = entityKindOfDim(dim);
  if (!kind) return id;
  return LABELS[kind].get(id) ?? id;
}

export function entityLabel(kind: EntityKind, id: string): string {
  return LABELS[kind].get(id) ?? id;
}

export { TIER_LABELS_TH };
