import type { FactRequest, FactResult, MasterData, MetricDef } from "@/lib/contracts";

export type EntityKind = "agent" | "sku" | "dc" | "campaign" | "user";

export type EntityDescription =
  | { ok: true; data: Record<string, unknown>; summary: string }
  | { ok: false; error: string };

/** The warehouse behind the semantic layer: fact requests Cop already scoped, and the dimension tables Cop names things with; never a question or a caller's access. */
export type MetricsPort = {
  readFacts(requests: FactRequest[]): Promise<FactResult[]>;
  masterData(): Promise<MasterData>;
  listMetrics(search: string | null): Promise<MetricDef[]>;
  describeEntity(kind: EntityKind, query: string): Promise<EntityDescription>;
};
