import { REGIONS, type Brand, type Dim, type MasterData, type Region } from "@/lib/contracts";
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

function skuTerms(master: MasterData, sku: MasterData["skus"][number]): string[] {
  const brand = master.brands.find((info) => info.id === sku.brand);
  const nicknames = brand ? [brand.nameTh, ...brand.nicknames] : [];
  const sizes = PACK_SIZE_TOKENS[sku.pack] ?? [];
  const terms = [sku.id, sku.nameTh, sku.label, master.packs.find((pack) => pack.id === sku.pack)?.nameTh ?? sku.pack];
  for (const nickname of nicknames) {
    terms.push(nickname);
    for (const size of sizes) terms.push(`${nickname} ${size}`);
  }
  return terms;
}

function candidatesOf(master: MasterData): Record<EntityKind, Candidate[]> {
  return {
    agent: master.agents.map((agent) => ({ id: agent.id, label: agent.nameTh, terms: [agent.id, ...agentTerms(agent.nameTh)] })),
    sku: master.skus.map((sku) => ({ id: sku.id, label: sku.nameTh, terms: skuTerms(master, sku) })),
    dc: master.dcs.map((dc) => ({ id: dc.id, label: dc.nameTh, terms: [dc.id, dc.nameTh, dc.label, dc.nameTh.replace("ศูนย์กระจายสินค้า", "")] })),
    campaign: master.campaigns.map((campaign) => ({ id: campaign.id, label: campaign.nameTh, terms: [campaign.id, campaign.nameTh, campaign.label] })),
    user: USERS.map((user) => ({ id: user.id, label: user.nameTh, terms: [user.id, user.name, user.nameTh, user.email, user.title] })),
    region: master.regions.map((region) => ({ id: region.id, label: region.nameTh, terms: [region.id, region.nameTh, ...(REGION_ALIASES[region.id] ?? [])] })),
    province: master.provinces.map((province) => ({ id: province.id, label: province.nameTh, terms: [province.id, province.nameTh, ...(PROVINCE_ALIASES[province.id] ?? [])] })),
    brand: master.brands.map((info) => ({ id: info.id, label: info.nameTh, terms: [info.id, info.nameTh, info.label, ...info.nicknames] })),
    channel: master.channels.map((channel) => ({ id: channel.id, label: channel.nameTh, terms: [channel.id, channel.nameTh, channel.label] })),
    pack: master.packs.map((pack) => ({ id: pack.id, label: pack.nameTh, terms: [pack.id, pack.nameTh, ...(PACK_SIZE_TOKENS[pack.id] ?? [])] })),
    plant: master.plants.map((plant) => ({ id: plant.id, label: plant.nameTh, terms: [plant.id, plant.nameTh, plant.label, plant.nameTh.replace("โรงงาน", "")] })),
    department: master.departments.map((department) => ({ id: department.id, label: department.nameTh, terms: [department.id, department.nameTh, department.label] })),
    business_unit: master.businessUnits.map((unit) => ({ id: unit.id, label: unit.nameTh, terms: [unit.id, unit.nameTh, unit.id.replace("_", " ")] })),
    chain: master.chains.map((chain) => ({ id: chain.id, label: chain.nameTh, terms: [chain.id, chain.nameTh, chain.label] })),
    maker: master.makers.map((maker) => ({ id: maker.id, label: maker.nameTh, terms: [maker.id, maker.nameTh, maker.label, ...maker.nicknames] })),
  };
}

function labelsOf(candidates: Record<EntityKind, Candidate[]>): Record<EntityKind, Map<string, string>> {
  const table = {} as Record<EntityKind, Map<string, string>>;
  for (const kind of Object.keys(candidates) as EntityKind[]) {
    table[kind] = new Map(candidates[kind].map((entry) => [entry.id, entry.label]));
  }
  return table;
}

function termScore(term: string, needle: string): number {
  const left = canon(term);
  if (!left || !needle) return 0;
  if (left === needle) return 100;
  if (needle.includes(left) && left.length >= 3) return 40 + left.length;
  if (left.includes(needle) && needle.length >= 3) return 20 + needle.length;
  return 0;
}

const DIM_KINDS: Partial<Record<Dim, EntityKind>> = {
  region: "region", province: "province", channel: "channel", brand: "brand", sku: "sku",
  pack: "pack", agent: "agent", dc: "dc", plant: "plant", campaign: "campaign",
  department: "department", business_unit: "business_unit", maker: "maker",
};

export function entityKindOfDim(dim: Dim): EntityKind | null {
  return DIM_KINDS[dim] ?? null;
}

/** Names, lookups and geography over one master-data snapshot: the only way Winyu turns ids into words and words into ids. */
export type Dictionary = {
  master: MasterData;
  /** Best entity of that kind for free text, tolerant of Thai spelling variants and nicknames. */
  resolveEntity(kind: EntityKind, text: string): ResolvedEntity | null;
  resolveEntities(kind: EntityKind, text: string): ResolvedEntity[];
  /** Turns a filter value the model typed into the canonical entity id. */
  resolveDimValue(dim: Dim, value: string): string | null;
  displayLabel(dim: Dim, id: string): string;
  entityLabel(kind: EntityKind, id: string): string;
  /** The region a dimension value sits in, or null when the dimension carries no geography. */
  regionOf(dim: Dim, value: string): Region | null;
  /** The brand a dimension value belongs to, or null when the dimension carries no brand. */
  brandOf(dim: Dim, value: string): Brand | null;
};

/** Builds the dictionary for one master-data snapshot. */
export function createDictionary(master: MasterData): Dictionary {
  const candidates = candidatesOf(master);
  const labels = labelsOf(candidates);
  const provinces = new Map(master.provinces.map((province) => [province.id, province.region]));
  const agents = new Map(master.agents.map((agent) => [agent.id, agent.region]));
  const dcs = new Map(master.dcs.map((dc) => [dc.id, dc.region]));
  const plants = new Map(master.plants.map((plant) => [plant.id, plant.region]));
  const brands = new Set<string>(master.brands.map((brand) => brand.id));
  const skus = new Map(master.skus.map((sku) => [sku.id, sku.brand]));

  function resolveEntities(kind: EntityKind, text: string): ResolvedEntity[] {
    const needle = canon(text);
    if (!needle) return [];
    const matches: ResolvedEntity[] = [];
    for (const candidate of candidates[kind]) {
      let best = 0;
      for (const term of candidate.terms) best = Math.max(best, termScore(term, needle));
      if (best > 0) matches.push({ kind, id: candidate.id, label: candidate.label, score: best });
    }
    return matches.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  }

  function resolveEntity(kind: EntityKind, text: string): ResolvedEntity | null {
    return resolveEntities(kind, text)[0] ?? null;
  }

  return {
    master,
    resolveEntity,
    resolveEntities,
    resolveDimValue(dim, value) {
      const kind = entityKindOfDim(dim);
      if (!kind) return value;
      if (labels[kind].has(value)) return value;
      return resolveEntity(kind, value)?.id ?? null;
    },
    displayLabel(dim, id) {
      const kind = entityKindOfDim(dim);
      if (!kind) return id;
      return labels[kind].get(id) ?? id;
    },
    entityLabel(kind, id) {
      return labels[kind].get(id) ?? id;
    },
    regionOf(dim, value) {
      if (dim === "region") return REGIONS.includes(value as Region) ? (value as Region) : null;
      if (dim === "province") return provinces.get(value) ?? null;
      if (dim === "agent") return agents.get(value) ?? null;
      if (dim === "dc") return dcs.get(value) ?? null;
      if (dim === "plant") return plants.get(value) ?? null;
      return null;
    },
    brandOf(dim, value) {
      if (dim === "brand") return brands.has(value) ? (value as Brand) : null;
      if (dim === "sku") return skus.get(value) ?? null;
      return null;
    },
  };
}
