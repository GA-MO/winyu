import { applyScope, outOfScopeFilters, scopePredicates } from "@/lib/access/enforce";
import type { AccessContext, Brand, Dim, MetricDef, MetricHeadline, MetricId, MetricQuery, MetricResult, MetricRow, Provenance, Region } from "@/lib/contracts";
import { USERS, findUser } from "@/lib/data/entities/users";
import type { DataPort, EntityDescription, EntityKind } from "./data-port";

const TODAY = "2026-09-22";
const FIRST_MONTH = "2025-10";
const MONTH_COUNT = 12;
const MAX_ROWS = 60;
const MASKED = "***";
const PERCENT_FORMAT = "percent";

const REGION_LABELS: Record<Region, string> = {
  bkk: "กรุงเทพฯ",
  central: "ภาคกลาง",
  north: "ภาคเหนือ",
  northeast: "ภาคอีสาน",
  east: "ภาคตะวันออก",
  south: "ภาคใต้",
};

const BRAND_LABELS: Record<string, string> = { singha: "สิงห์", leo: "ลีโอ", purra: "เพอร์ร่า" };

const STUB_BRANDS: Brand[] = ["singha", "leo", "purra"];
const DEPARTMENTS = ["ขาย", "การตลาด", "การเงิน", "ซัพพลายเชน", "ทรัพยากรบุคคล", "ไอที"];

type StubAgent = { id: string; name: string; region: Region; tier: "A" | "B" | "C" };

const AGENTS: StubAgent[] = [
  { id: "ag_rungrueang", name: "ส.รุ่งเรือง เทรดดิ้ง", region: "northeast", tier: "A" },
  { id: "ag_isan_panich", name: "อีสานพาณิชย์", region: "northeast", tier: "B" },
  { id: "ag_khonkaen_sap", name: "ขอนแก่นทรัพย์ทวี", region: "northeast", tier: "C" },
  { id: "ag_bangkok_dee", name: "บางกอกดีเทรด", region: "bkk", tier: "A" },
  { id: "ag_thonburi", name: "ธนบุรีเบฟเวอเรจ", region: "bkk", tier: "B" },
  { id: "ag_ayutthaya", name: "อยุธยาการค้า", region: "central", tier: "B" },
  { id: "ag_saraburi", name: "สระบุรีรุ่งทรัพย์", region: "central", tier: "C" },
  { id: "ag_chiangmai", name: "เชียงใหม่ศรีทอง", region: "north", tier: "A" },
  { id: "ag_lampang", name: "ลำปางเจริญพร", region: "north", tier: "C" },
  { id: "ag_chonburi", name: "ชลบุรีมารีน", region: "east", tier: "B" },
  { id: "ag_hatyai", name: "หาดใหญ่ใต้รวมค้า", region: "south", tier: "A" },
  { id: "ag_surat", name: "สุราษฎร์ธานีพาณิชย์", region: "south", tier: "C" },
];

const SKUS = [
  { id: "sku_leo_620", nameTh: "ลีโอ ขวด 620", brand: "leo", pack: "bottle_620", hlPerCase: 0.0744, pricePerCase: 640 },
  { id: "sku_singha_320", nameTh: "สิงห์ กระป๋อง 320", brand: "singha", pack: "can_320", hlPerCase: 0.0768, pricePerCase: 720 },
  { id: "sku_purra_600", nameTh: "เพอร์ร่า PET 600", brand: "purra", pack: "pet_600", hlPerCase: 0.072, pricePerCase: 130 },
];

const DCS = [
  { id: "dc_khonkaen", nameTh: "ศูนย์กระจายสินค้า ขอนแก่น", region: "northeast" },
  { id: "dc_lamphun", nameTh: "ศูนย์กระจายสินค้า ลำพูน", region: "north" },
  { id: "dc_bangna", nameTh: "ศูนย์กระจายสินค้า บางนา", region: "bkk" },
];

const CAMPAIGNS = [
  { id: "cmp_songkran_2026", nameTh: "สงกรานต์ 2569", from: "2026-04-01", to: "2026-04-20", brands: ["singha", "leo"], spend: 24_000_000 },
  { id: "cmp_purra_clean_air", nameTh: "เพอร์ร่า อากาศสะอาดภาคเหนือ", from: "2026-01-15", to: "2026-03-31", brands: ["purra"], spend: 8_500_000 },
  { id: "cmp_leo_music", nameTh: "ลีโอ มิวสิกเฟส", from: "2025-11-01", to: "2025-12-20", brands: ["leo"], spend: 16_000_000 },
];

type MetricShape = { base: number; spread: number; family: "commercial" | "hr"; aggregate: "sum" | "average" };

const METRIC_DEFS: Partial<Record<MetricId, MetricDef>> = {
  net_sales_volume: def("net_sales_volume", "Net sales volume", "ยอดขายสุทธิ (ปริมาณ)", "HL", "number", "u_prasit", true, ["region", "brand", "agent", "month", "sku", "channel"], [], ["ยอดขาย", "ยอดรวม", "ปริมาณขาย", "sell-in", "volume"], "ปริมาณขายสุทธิจากบริษัทถึงเอเย่นต์", "SAP-SD"),
  net_sales_value: def("net_sales_value", "Net sales value", "ยอดขายสุทธิ (มูลค่า)", "บาท", "currency", "u_siriporn", true, ["region", "brand", "agent", "month", "channel"], [], ["มูลค่าขาย", "รายได้", "revenue"], "มูลค่าขายสุทธิหลังส่วนลด", "SAP-SD"),
  sell_out_volume: def("sell_out_volume", "Sell out volume", "ยอดขายออกหน้าร้าน", "HL", "number", "u_prasit", true, ["region", "brand", "agent", "month"], [], ["sell-out", "ยอดขายออก", "ขายหน้าร้าน"], "ปริมาณที่เอเย่นต์ขายออกสู่ร้านค้า", "DMS"),
  target_attainment: def("target_attainment", "Target attainment", "ความคืบหน้าเทียบเป้า", "%", "percent", "u_prasit", true, ["region", "brand", "agent", "month"], [], ["เทียบเป้า", "บรรลุเป้า", "attainment"], "สัดส่วนยอดขายจริงต่อเป้า", "SAP-SD"),
  days_of_cover: def("days_of_cover", "Days of cover", "วันคงคลัง", "วัน", "number", "u_wee", true, ["region", "dc", "brand", "month"], [], ["วันคงคลัง", "สต๊อกพอกี่วัน", "doc"], "จำนวนวันที่สต๊อกรองรับยอดขายเฉลี่ย 28 วัน", "WMS"),
  gross_margin: def("gross_margin", "Gross margin", "อัตรากำไรขั้นต้น", "%", "percent", "u_siriporn", true, ["region", "brand", "business_unit", "month"], ["region"], ["กำไรขั้นต้น", "มาร์จิ้น", "margin"], "กำไรขั้นต้นหลังต้นทุนขายและภาษีสรรพสามิต", "SAP-FI"),
  ar_overdue: def("ar_overdue", "AR overdue", "ลูกหนี้เกินกำหนด", "บาท", "currency", "u_mint", true, ["region", "agent", "month"], [], ["ลูกหนี้", "ค้างชำระ", "overdue"], "ยอดลูกหนี้การค้าที่เลยกำหนดชำระ", "SAP-FI"),
  avg_salary: def("avg_salary", "Average salary", "เงินเดือนเฉลี่ย", "บาท", "currency", "u_may", true, ["department", "month"], ["department"], ["เงินเดือน", "ค่าจ้าง", "salary"], "เงินเดือนเฉลี่ยต่อคนต่อเดือนของแต่ละฝ่าย", "Workday"),
  headcount: def("headcount", "Headcount", "จำนวนพนักงาน", "คน", "number", "u_may", true, ["department", "month"], [], ["จำนวนพนักงาน", "กำลังคน", "headcount"], "จำนวนพนักงานประจำสิ้นเดือน", "Workday"),
};

const METRIC_SHAPES: Partial<Record<MetricId, MetricShape>> = {
  net_sales_volume: { base: 780, spread: 0.35, family: "commercial", aggregate: "sum" },
  net_sales_value: { base: 7_400_000, spread: 0.35, family: "commercial", aggregate: "sum" },
  sell_out_volume: { base: 740, spread: 0.3, family: "commercial", aggregate: "sum" },
  target_attainment: { base: 97, spread: 14, family: "commercial", aggregate: "average" },
  days_of_cover: { base: 14, spread: 7, family: "commercial", aggregate: "average" },
  gross_margin: { base: 38, spread: 7, family: "commercial", aggregate: "average" },
  ar_overdue: { base: 620_000, spread: 0.6, family: "commercial", aggregate: "sum" },
  avg_salary: { base: 42_000, spread: 0.45, family: "hr", aggregate: "average" },
  headcount: { base: 180, spread: 0.5, family: "hr", aggregate: "sum" },
};

function def(
  id: MetricId,
  label: string,
  labelTh: string,
  unit: string,
  format: MetricDef["format"],
  owner: string,
  certified: boolean,
  dims: Dim[],
  aclDims: Dim[],
  synonyms: string[],
  description: string,
  sourceSystem: string,
): MetricDef {
  return { id, label, labelTh, unit, format, owner, certified, dims, aclDims, synonyms, description, sourceSystem };
}

function pseudo(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 100000) / 100000;
}

function monthAt(offset: number): string {
  const [year, month] = FIRST_MONTH.split("-").map(Number);
  const total = year * 12 + (month - 1) + offset;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

const MONTHS = Array.from({ length: MONTH_COUNT }, (unused, index) => monthAt(index));

function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

function monthsInRange(range: { from: string; to: string }): string[] {
  const from = monthOf(range.from);
  const to = monthOf(range.to);
  const inside = MONTHS.filter((month) => month >= from && month <= to);
  return inside.length > 0 ? inside : [MONTHS[MONTHS.length - 1]];
}

function seasonality(month: string): number {
  const index = MONTHS.indexOf(month);
  return 1 + 0.18 * Math.sin(((index + 2) / MONTH_COUNT) * 2 * Math.PI);
}

type Fact = { dims: Partial<Record<Dim, string>>; value: number };

const factCache = new Map<MetricId, Fact[]>();

function commercialFacts(metric: MetricId, shape: MetricShape): Fact[] {
  const facts: Fact[] = [];
  for (const agent of AGENTS) {
    for (const brand of STUB_BRANDS) {
      for (const month of MONTHS) {
        const noise = pseudo(`${metric}|${agent.id}|${brand}|${month}`);
        const value =
          shape.aggregate === "average"
            ? shape.base + (noise - 0.5) * shape.spread
            : shape.base * seasonality(month) * (0.7 + 0.6 * noise) * (agent.tier === "A" ? 1.4 : agent.tier === "B" ? 1 : 0.65);
        facts.push({ dims: { region: agent.region, brand, agent: agent.name, month }, value });
      }
    }
  }
  return facts;
}

function hrFacts(metric: MetricId, shape: MetricShape): Fact[] {
  const facts: Fact[] = [];
  for (const department of DEPARTMENTS) {
    for (const month of MONTHS) {
      const noise = pseudo(`${metric}|${department}|${month}`);
      const value = shape.aggregate === "average" ? shape.base * (0.7 + 0.8 * noise) : Math.round(shape.base * (0.4 + noise));
      facts.push({ dims: { department, month }, value });
    }
  }
  return facts;
}

function factsOf(metric: MetricId): Fact[] {
  const cached = factCache.get(metric);
  if (cached) return cached;
  const shape = METRIC_SHAPES[metric];
  const facts = !shape ? [] : shape.family === "hr" ? hrFacts(metric, shape) : commercialFacts(metric, shape);
  factCache.set(metric, facts);
  return facts;
}

function labelOf(dim: Dim, value: string): string {
  if (dim === "region") return REGION_LABELS[value as Region] ?? value;
  if (dim === "brand") return BRAND_LABELS[value] ?? value;
  return value;
}

function matchesFilters(fact: Fact, filters: Partial<Record<Dim, string[]>>): boolean {
  for (const [dim, values] of Object.entries(filters) as [Dim, string[] | undefined][]) {
    if (!values || values.length === 0) continue;
    const factValue = fact.dims[dim];
    if (factValue === undefined) continue;
    if (!values.includes(factValue)) return false;
  }
  return true;
}

function groupKey(fact: Fact, dims: Dim[]): string {
  return dims.map((dim) => fact.dims[dim] ?? "-").join("|");
}

function aggregate(values: number[], mode: MetricShape["aggregate"]): number {
  const total = values.reduce((sum, value) => sum + value, 0);
  return mode === "average" ? total / Math.max(1, values.length) : total;
}

function shiftedMonths(months: string[], compare: MetricQuery["compare"]): string[] {
  if (compare === "prev_year") return months.map((month) => shiftMonth(month, -12));
  if (compare === "prev_period") return months.map((month) => shiftMonth(month, -months.length));
  return months;
}

function shiftMonth(month: string, offset: number): string {
  const [year, index] = month.split("-").map(Number);
  const total = year * 12 + (index - 1) + offset;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

function formatValue(value: number, format: MetricDef["format"]): string {
  if (format === PERCENT_FORMAT) return `${value.toFixed(1)}%`;
  const digits = Math.abs(value) >= 1000 ? 0 : 1;
  return value.toLocaleString("th-TH", { maximumFractionDigits: digits });
}

function targetOf(metric: MetricId, key: string, value: number): number {
  return value / (0.88 + 0.28 * pseudo(`target|${metric}|${key}`));
}

function denied(reason: string): MetricResult {
  return { ok: false, error: reason, code: "PERMISSION_DENIED" };
}

function provenanceOf(
  metricDef: MetricDef,
  access: AccessContext,
  query: MetricQuery,
  rowCount: number,
  masked: string[],
): Provenance {
  return {
    metric: metricDef.id,
    certified: metricDef.certified,
    sourceSystem: metricDef.sourceSystem,
    asOf: TODAY,
    rowCount,
    filtersApplied: query.filters,
    scopeApplied: scopePredicates(access),
    masked,
    trust: metricDef.certified ? "verified" : "derived",
  };
}

function summaryOf(metricDef: MetricDef, rows: MetricRow[], total: number, masked: boolean, months: string[]): string {
  const period = months.length === 1 ? months[0] : `${months[0]} ถึง ${months[months.length - 1]}`;
  if (masked) return `${metricDef.labelTh} ช่วง ${period}: ค่าถูกปิดตามสิทธิ์ ${rows.length} แถว`;
  return `${metricDef.labelTh} ช่วง ${period}: รวม ${formatValue(total, metricDef.format)} ${metricDef.unit} จาก ${rows.length} แถว`;
}

function headlineOf(metricDef: MetricDef, rows: MetricRow[], total: number, masked: boolean, months: string[]): MetricHeadline {
  const periodLabel = months.length === 1 ? months[0] : `${months[0]} ถึง ${months[months.length - 1]}`;
  return {
    aggregate: "sum",
    value: masked ? "—" : `${formatValue(total, metricDef.format)} ${metricDef.unit}`.trim(),
    periodLabel,
    rowCount: rows.length,
    deltaPercent: null,
    compareLabel: null,
    top: [],
  };
}

function runMetric(query: MetricQuery, access: AccessContext): MetricResult {
  const metricDef = METRIC_DEFS[query.metric];
  const shape = METRIC_SHAPES[query.metric];
  if (!metricDef || !shape) return { ok: false, error: `ยังไม่มีเมตริก ${query.metric} ในชุดข้อมูลตัวอย่าง`, code: "UNKNOWN_METRIC" };

  const visibility = access.metricAcl[query.metric];
  if (visibility === "none") return denied(`เมตริก ${metricDef.labelTh} อยู่นอกขอบเขตสิทธิ์ของบทบาท ${access.role}`);

  const unknownDims = query.dims.filter((dim) => !metricDef.dims.includes(dim));
  if (unknownDims.length > 0) return { ok: false, error: `มิติ ${unknownDims.join(", ")} ใช้กับ ${metricDef.labelTh} ไม่ได้`, code: "BAD_QUERY" };

  const denials = outOfScopeFilters(access, query.filters);
  if (denials.length > 0) {
    const first = denials[0];
    return denied(`${first.dim} ${first.requested.join(", ")} อยู่นอกขอบเขตของผู้ใช้ (ดูได้เฉพาะ ${first.allowed.join(", ")})`);
  }

  const months = monthsInRange(query.range);
  const filters = applyScope(access, query.filters);
  const facts = factsOf(query.metric).filter((fact) => matchesFilters(fact, filters));
  const groupDims = query.dims.filter((dim) => dim !== "date" && dim !== "week");
  const current = facts.filter((fact) => months.includes(fact.dims.month ?? ""));

  type Group = { dims: Partial<Record<Dim, string>>; values: number[] };
  const groups = new Map<string, Group>();
  for (const fact of current) {
    const key = groupKey(fact, groupDims);
    const fallback: Group = { dims: Object.fromEntries(groupDims.map((dim) => [dim, fact.dims[dim] ?? "-"])), values: [] };
    const group = groups.get(key) ?? fallback;
    group.values.push(fact.value);
    groups.set(key, group);
  }
  if (groups.size === 0) groups.set("-", { dims: {}, values: [] });

  const compareMonths = shiftedMonths(months, query.compare);
  const compareFacts = query.compare === "none" ? [] : facts.filter((fact) => compareMonths.includes(fact.dims.month ?? ""));
  const compareGroups = new Map<string, number[]>();
  for (const fact of compareFacts) {
    const key = groupKey(fact, groupDims);
    compareGroups.set(key, [...(compareGroups.get(key) ?? []), fact.value]);
  }

  const masked = visibility === "masked";
  const rows: MetricRow[] = [];
  let total = 0;
  for (const [key, group] of groups) {
    const value = aggregate(group.values, shape.aggregate);
    total += value;
    const row: MetricRow = {};
    for (const dim of groupDims) row[dim] = labelOf(dim, group.dims[dim] ?? "-");
    row.value = masked ? MASKED : Math.round(value * 10) / 10;
    row.valueLabel = masked ? MASKED : formatValue(value, metricDef.format);
    if (query.compare !== "none") {
      const previous =
        query.compare === "target"
          ? targetOf(query.metric, key, value)
          : aggregate(compareGroups.get(key) ?? [], shape.aggregate);
      const delta = previous === 0 ? 0 : ((value - previous) / previous) * 100;
      row.compareValue = masked ? MASKED : Math.round(previous * 10) / 10;
      row.compareLabel = masked ? MASKED : formatValue(previous, metricDef.format);
      row.deltaPct = masked ? MASKED : Math.round(delta * 10) / 10;
      row.deltaLabel = masked ? MASKED : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;
    }
    rows.push(row);
  }

  if (!masked) rows.sort((left, right) => Number(right.value ?? 0) - Number(left.value ?? 0));
  const limited = rows.slice(0, Math.min(query.limit ?? MAX_ROWS, MAX_ROWS));
  const maskedFields = masked ? ["value", "compareValue", "deltaPct"] : [];
  return {
    ok: true,
    rows: limited,
    summary: summaryOf(metricDef, limited, total, masked, months),
    headline: headlineOf(metricDef, limited, total, masked, months),
    provenance: provenanceOf(metricDef, access, query, limited.length, maskedFields),
  };
}

function listMetrics(search: string | null): MetricDef[] {
  const defs = Object.values(METRIC_DEFS).filter((metricDef): metricDef is MetricDef => Boolean(metricDef));
  if (!search) return defs;
  const needle = search.toLowerCase();
  return defs.filter((metricDef) =>
    [metricDef.id, metricDef.label, metricDef.labelTh, ...metricDef.synonyms].some((text) => text.toLowerCase().includes(needle)),
  );
}

function describeEntity(kind: EntityKind, query: string): EntityDescription {
  const needle = query.toLowerCase();
  if (kind === "user") {
    const user = findUser(query) ?? USERS.find((candidate) => candidate.nameTh.includes(query) || candidate.name.toLowerCase().includes(needle));
    if (!user) return { ok: false, error: `ไม่พบผู้ใช้ "${query}"` };
    return { ok: true, data: { id: user.id, nameTh: user.nameTh, title: user.title, role: user.role, department: user.department, region: user.region, email: user.email }, summary: `${user.nameTh} — ${user.title}` };
  }
  if (kind === "agent") {
    const agent = AGENTS.find((candidate) => candidate.id === query || candidate.name.includes(query));
    if (!agent) return { ok: false, error: `ไม่พบเอเย่นต์ "${query}"` };
    return { ok: true, data: { ...agent, regionLabel: REGION_LABELS[agent.region] }, summary: `${agent.name} เอเย่นต์ระดับ ${agent.tier} ${REGION_LABELS[agent.region]}` };
  }
  if (kind === "sku") {
    const sku = SKUS.find((candidate) => candidate.id === query || candidate.nameTh.includes(query));
    if (!sku) return { ok: false, error: `ไม่พบสินค้า "${query}"` };
    return { ok: true, data: { ...sku }, summary: `${sku.nameTh} (${sku.hlPerCase} HL ต่อลัง)` };
  }
  if (kind === "dc") {
    const dc = DCS.find((candidate) => candidate.id === query || candidate.nameTh.includes(query));
    if (!dc) return { ok: false, error: `ไม่พบศูนย์กระจายสินค้า "${query}"` };
    return { ok: true, data: { ...dc }, summary: dc.nameTh };
  }
  const campaign = CAMPAIGNS.find((candidate) => candidate.id === query || candidate.nameTh.includes(query));
  if (!campaign) return { ok: false, error: `ไม่พบแคมเปญ "${query}"` };
  return { ok: true, data: { ...campaign }, summary: `${campaign.nameTh} (${campaign.from} ถึง ${campaign.to})` };
}

/** The in-memory data engine the agent runs on until 1A registers the real one. */
export const stubDataPort: DataPort = { runMetric, listMetrics, describeEntity };

export const STUB_TODAY = TODAY;
export const STUB_AGENTS = AGENTS;
export const STUB_MONTHS = MONTHS;
