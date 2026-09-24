import type { AccessContext, MetricDef, MetricQuery, MetricResult } from "@/lib/contracts";

export type EntityKind = "agent" | "sku" | "dc" | "campaign" | "user";

export type EntityDescription =
  | { ok: true; data: Record<string, unknown>; summary: string }
  | { ok: false; error: string };

/** The warehouse behind the semantic layer: every metric read, the metric catalogue and master-data lookups. */
export type MetricsPort = {
  runMetric(query: MetricQuery, access: AccessContext): Promise<MetricResult>;
  listMetrics(search: string | null): Promise<MetricDef[]>;
  describeEntity(kind: EntityKind, query: string): Promise<EntityDescription>;
};
