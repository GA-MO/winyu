import type { FactRequest, FactResult, MasterData, MetricDef } from "@/lib/contracts";

export type EntityKind = "agent" | "sku" | "dc" | "campaign" | "user";

export type EntityDescription =
  | { ok: true; data: Record<string, unknown>; summary: string }
  | { ok: false; error: string };

/** The warehouse behind the semantic layer: fact requests Winyu already scoped, and the dimension tables Winyu names things with; never a question or a caller's access. */
export type MetricsPort = {
  readFacts(requests: FactRequest[]): Promise<FactResult[]>;
  masterData(): Promise<MasterData>;
  listMetrics(search: string | null): Promise<MetricDef[]>;
  describeEntity(kind: EntityKind, query: string): Promise<EntityDescription>;
};

export type MetricsUnavailableReason = "timeout" | "unreachable" | "refused" | "malformed";

/** A metrics port that could not answer: the source timed out, could not be reached, refused the call or sent something that is not the contract. */
export class MetricsUnavailable extends Error {
  readonly reason: MetricsUnavailableReason;

  constructor(reason: MetricsUnavailableReason, detail: string) {
    super(`metrics source ${reason}: ${detail}`);
    this.name = "MetricsUnavailable";
    this.reason = reason;
  }
}
