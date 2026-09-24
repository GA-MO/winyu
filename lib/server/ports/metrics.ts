import type { AccessContext, MetricDef, MetricQuery, MetricResult } from "@/lib/contracts";
import { generatorMetricsPort } from "@/lib/data/register";

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

let port: MetricsPort = generatorMetricsPort;

/** The warehouse Cop reads through: the generator by default, or whatever `registerMetricsPort` installed. */
export function metricsPort(): MetricsPort {
  return port;
}

export function registerMetricsPort(next: MetricsPort): void {
  port = next;
}

export function resetMetricsPort(): void {
  port = generatorMetricsPort;
}
