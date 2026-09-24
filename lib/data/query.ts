import type { AccessContext, Dim, MetricDef, MetricQuery, MetricResult } from "@/lib/contracts";
import { METRIC_LIST, findMetric } from "@/lib/semantic/metrics";
import { resolveEntities, resolveEntity } from "@/lib/semantic/dictionary";
import { evaluateMetric, keyRows, seriesRequest, type SeriesQuery } from "@/lib/semantic/engine";
import { INJECTED_ANOMALIES } from "./anomalies";
import { readGeneratorFacts } from "./facts";
import { AGENTS, agentById } from "./entities/agents";
import { campaignById } from "./entities/marketing";
import { BUSINESS_UNIT_LABELS_TH, PROVINCES, REGION_LABELS_TH } from "./entities/org";
import { BRAND_INFO, LITRES_PER_HL, skuById } from "./entities/products";
import { dcById } from "./entities/supply";
import { findUser } from "./entities/users";

const PERCENT = 100;

/** Runs one certified metric query under the caller's access scope, reading facts straight from the generator. */
export function runMetric(query: MetricQuery, access: AccessContext): MetricResult {
  return evaluateMetric(query, access, readGeneratorFacts);
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
  const litresPerCase = Math.round(sku.hlPerCase * LITRES_PER_HL * 100) / 100;
  const data = {
    id: sku.id,
    ชื่อ: sku.nameTh,
    แบรนด์: brand?.nameTh ?? sku.brand,
    หน่วยธุรกิจ: BUSINESS_UNIT_LABELS_TH[brand?.businessUnit ?? "beer"],
    บรรจุภัณฑ์: sku.pack,
    ลิตรต่อลัง: litresPerCase,
    ราคาต่อลัง: sku.pricePerCase,
    ภาษีสรรพสามิต: sku.excise ? "มี" : "ไม่มี",
  };
  return { ok: true, data, summary: `${sku.nameTh} แบรนด์${brand?.nameTh ?? sku.brand} ${litresPerCase} ลิตรต่อลัง ราคา ${sku.pricePerCase} บาทต่อลัง` };
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

export type { SeriesQuery };
export type SeriesRow = { key: string; dims: Record<Dim, string>; value: number };

/** The batch plane's reader: the same aggregation as `runMetric` without access scoping, masking or the row cap. */
export function runSeries(query: SeriesQuery): SeriesRow[] {
  const request = seriesRequest(query);
  if (!request) return [];
  const facts = readGeneratorFacts(request);
  return facts.ok ? keyRows(request.dims, facts.rows) : [];
}
