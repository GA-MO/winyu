import { COMPARE_MODES, type MetricQuery } from "@/lib/contracts";
import type { Corrector } from "@/lib/harness/types";
import { TH } from "@/lib/i18n/th";
import { TARGET_METRICS, metricDef } from "@/lib/semantic/metrics";

const FIXABLE_CODES: ReadonlySet<string> = new Set(["BAD_QUERY"]);

/** What a metric can be asked for, so a refused query_metric call can be fixed in one more call instead of browsing list_metrics. */
export const metricQueryFix: Corrector = ({ input, observation }) => {
  if (!observation.evidence.code || !FIXABLE_CODES.has(observation.evidence.code)) return null;
  const def = metricDef((input as Partial<MetricQuery>).metric ?? "");
  if (!def) return null;
  const compares = COMPARE_MODES.filter((mode) => mode !== "target" || TARGET_METRICS.has(def.id));
  return TH.harness.metricFix(def.labelTh, def.id, def.dims.join(", "), compares.join(", "));
};
