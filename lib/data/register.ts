import type { MetricsPort } from "@/lib/server/ports/metrics";
import { describeEntity, listMetrics, runMetric } from "./query";

export const generatorMetricsPort: MetricsPort = {
  runMetric: async (query, access) => runMetric(query, access),
  listMetrics: async (search) => listMetrics(search),
  describeEntity: async (kind, query) => describeEntity(kind, query),
};
