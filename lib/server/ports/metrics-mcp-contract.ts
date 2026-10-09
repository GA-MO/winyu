import { z } from "zod";
import {
  BRANDS, BUSINESS_UNITS, REGIONS, dimSchema, describeEntityInputSchema, listMetricsInputSchema, metricIdSchema,
  type FactRequest, type FactResult, type MasterData, type MetricDef,
} from "@/lib/contracts";
import type { EntityDescription } from "./metrics";

export const METRICS_MCP_PORT = 3297;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const regionSchema = z.enum(REGIONS);
const brandSchema = z.enum(BRANDS);
const businessUnitSchema = z.enum(BUSINESS_UNITS);
const named = { id: z.string(), nameTh: z.string(), label: z.string() };

export const factRequestSchema = z.object({
  metric: metricIdSchema,
  measure: z.enum(["actual", "target"]),
  dims: z.array(dimSchema),
  filters: z.partialRecord(dimSchema, z.array(z.string())),
  range: z.object({ from: z.string().regex(ISO_DATE), to: z.string().regex(ISO_DATE) }),
  labelShift: z.object({ days: z.number().int(), months: z.number().int() }),
}) satisfies z.ZodType<FactRequest>;

export const factResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), rows: z.array(z.object({ dims: z.partialRecord(dimSchema, z.string()), value: z.number(), weight: z.number() })) }),
  z.object({ ok: z.literal(false), code: z.literal("BAD_QUERY"), error: z.string() }),
]) satisfies z.ZodType<FactResult>;

export const masterDataSchema = z.object({
  regions: z.array(z.object({ id: regionSchema, nameTh: z.string() })),
  businessUnits: z.array(z.object({ id: businessUnitSchema, nameTh: z.string() })),
  provinces: z.array(z.object({ id: z.string(), nameTh: z.string(), region: regionSchema })),
  agents: z.array(z.object({ id: z.string(), nameTh: z.string(), provinceId: z.string(), region: regionSchema, servingDc: z.string() })),
  brands: z.array(z.object({ id: brandSchema, nameTh: z.string(), label: z.string(), nicknames: z.array(z.string()), businessUnit: businessUnitSchema })),
  packs: z.array(z.object({ id: z.string(), nameTh: z.string() })),
  skus: z.array(z.object({ id: z.string(), nameTh: z.string(), label: z.string(), brand: brandSchema, pack: z.string() })),
  dcs: z.array(z.object({ ...named, region: regionSchema })),
  plants: z.array(z.object({ ...named, region: regionSchema })),
  campaigns: z.array(z.object(named)),
  departments: z.array(z.object({ ...named, headcount: z.number() })),
  channels: z.array(z.object(named)),
  chains: z.array(z.object(named)),
  makers: z.array(z.object({ ...named, nicknames: z.array(z.string()) })),
  ownMaker: z.string(),
}) satisfies z.ZodType<MasterData>;

export const metricDefSchema = z.object({
  id: metricIdSchema,
  label: z.string(),
  labelTh: z.string(),
  unit: z.string(),
  format: z.enum(["number", "currency", "percent"]),
  owner: z.string(),
  certified: z.boolean(),
  dims: z.array(dimSchema),
  aclDims: z.array(dimSchema),
  synonyms: z.array(z.string()),
  description: z.string(),
  sourceSystem: z.string(),
}) satisfies z.ZodType<MetricDef>;

export const entityDescriptionSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: z.record(z.string(), z.unknown()), summary: z.string() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]) satisfies z.ZodType<EntityDescription>;

/** The data team's MCP contract, one tool per metrics-port method: plain JSON in, plain JSON out (`structuredContent`), every request already scoped by Winyu. */
export const METRICS_MCP_TOOLS = {
  query_facts: {
    description: "One aggregate from the warehouse: a metric's actual or target summed (and weighted for ratio metrics) over the given dims, filters and date range. Winyu has already narrowed the filters to what the caller may see.",
    input: factRequestSchema,
    output: factResultSchema,
  },
  master_data: {
    description: "The dimension tables Winyu names things with: regions, provinces, agents, brands, SKUs, DCs, plants, campaigns, departments, channels, chains and makers.",
    input: z.object({}),
    output: masterDataSchema,
  },
  list_metrics: {
    description: "The certified metric definitions, all of them when search is null, else those whose name or synonyms match.",
    input: listMetricsInputSchema,
    output: z.object({ metrics: z.array(metricDefSchema) }),
  },
  describe_entity: {
    description: "Reference data for one master-data record (agent, SKU, DC, campaign or user) found by name or id.",
    input: describeEntityInputSchema,
    output: entityDescriptionSchema,
  },
} as const;

export type MetricsMcpTool = keyof typeof METRICS_MCP_TOOLS;
export type MetricsMcpInput<Tool extends MetricsMcpTool> = z.infer<(typeof METRICS_MCP_TOOLS)[Tool]["input"]>;
export type MetricsMcpOutput<Tool extends MetricsMcpTool> = z.infer<(typeof METRICS_MCP_TOOLS)[Tool]["output"]>;

/** Where the metrics MCP listens, the secret Winyu signs identities with, and how long Winyu waits; from env, with local defaults for the demo only. */
export function metricsMcpEnv() {
  return {
    url: process.env.WINYU_METRICS_MCP_URL ?? `http://127.0.0.1:${METRICS_MCP_PORT}/mcp`,
    secret: process.env.WINYU_METRICS_MCP_SECRET ?? "winyu-metrics-demo-local-only",
    timeoutMs: Number(process.env.WINYU_METRICS_MCP_TIMEOUT_MS ?? 4000),
  };
}
