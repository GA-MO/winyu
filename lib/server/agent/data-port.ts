import type { AccessContext, MetricDef, MetricQuery, MetricResult } from "@/lib/contracts";
import { realDataPort } from "@/lib/data/register";

export type EntityKind = "agent" | "sku" | "dc" | "campaign" | "user";

export type EntityDescription =
  | { ok: true; data: Record<string, unknown>; summary: string }
  | { ok: false; error: string };

export type DataPort = {
  runMetric(query: MetricQuery, access: AccessContext): MetricResult;
  listMetrics(search: string | null): MetricDef[];
  describeEntity(kind: EntityKind, query: string): EntityDescription;
};

let port: DataPort = realDataPort;

/** The data engine the agent tools read through: the generator by default, or whatever `registerDataPort` installed. */
export function dataPort(): DataPort {
  return port;
}

export function registerDataPort(next: DataPort): void {
  port = next;
}

export function resetDataPort(): void {
  port = realDataPort;
}
