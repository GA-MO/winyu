import type { AccessContext, MetricQuery, MetricResult } from "@/lib/contracts";
import { comparisonRequestOf, finishMetric, planMetric } from "@/lib/semantic/engine";
import { ports } from "@/lib/server/ports";

/** Runs one certified metric query under the caller's access scope: Cop plans and finishes, the metrics port only reads facts. */
export async function runMetric(query: MetricQuery, access: AccessContext): Promise<MetricResult> {
  const plan = planMetric(query, access);
  if ("ok" in plan) return plan;
  const comparison = comparisonRequestOf(plan);
  const [current, previous] = await ports().metrics.readFacts(comparison ? [plan.current, comparison] : [plan.current]);
  return finishMetric(plan, current, previous ?? null);
}
