import type { z } from "zod";
import type { Alert } from "@/lib/contracts";
import { visitPlanInputSchema } from "@/lib/contracts";
import { alertRowOf } from "@/lib/cards/alert-row";
import { businessToday } from "@/lib/data/dates";
import { formatDelta, metricLabel } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";
import type { Dictionary } from "@/lib/semantic/dictionary";
import { fencedRows } from "@/lib/server/connectors/output";
import { VISIT_ROLES, VISIT_WINDOW, visitPlanFor, type PlannedVisit } from "@/lib/server/dashboard";
import { loadDictionary } from "@/lib/server/master-data";
import { currentAccess } from "@/lib/server/request-context";
import { defineTool } from "./define";

const DEFAULT_STOPS = 5;
const PARENTHETICAL = /\s*\(.*\)$/;
const BRAND_SEPARATOR = ", ";

/** The alert's own figure in its own words: how urgent, what moved, by how much against its normal level, over which days; never the four-week change. */
function alertLabelOf(alert: Alert, dictionary: Dictionary): string | null {
  const row = alertRowOf(alert, dictionary);
  if (!row.gapLabel) return null;
  const sign = alert.direction === "down" ? "−" : "+";
  const brands = alert.brands?.map((brand) => dictionary.displayLabel("brand", brand)).join(BRAND_SEPARATOR);
  const what = [metricLabel(alert.metric).replace(PARENTHETICAL, ""), brands].filter(Boolean).join(" ");
  return TH.visitPlan.alert(row.severityLabel, what, `${sign}${row.gapLabel}`, row.window);
}

function rowOf(visit: PlannedVisit, order: number, dictionary: Dictionary) {
  return {
    order,
    agent_name: visit.stop.agent,
    reason: visit.needsVisit ? visit.stop.reason : TH.visitPlan.steady,
    sales_change_pct: visit.change,
    sales_change_label: formatDelta(visit.change) ?? "—",
    sales_basis: TH.visitPlan.basis(VISIT_WINDOW),
    alert_label: visit.alert ? alertLabelOf(visit.alert, dictionary) : null,
  };
}

export const visitPlanTool = defineTool({
  name: "visit_plan",
  connector: "warehouse",
  tier: "read",
  roles: VISIT_ROLES,
  description:
    "Every agent the field rep owns, in visit order: agents with an open anomaly first, then the steepest sell-in drop over the last 4 weeks, then the rest, only in the rep's own scope. Each row carries the numbers the order rests on, each labelled with its own basis: sales_change_label is the 4-week sell-in change (sales_basis says against what), alert_label is the open anomaly's own gap against its normal level over its own days, never a 4-week change. metrics[0] is the agent to visit first. limit is how many stops (null = 5). Call it for ควรไปเอเย่นต์ไหนก่อน / แผนเยี่ยมวันนี้ / ลำดับการเยี่ยม. Not store_visits, which lists visits already made.",
  input: visitPlanInputSchema,
  execute: async ({ limit }: z.infer<typeof visitPlanInputSchema>) => {
    const [plan, dictionary] = await Promise.all([visitPlanFor(currentAccess()), loadDictionary()]);
    const shown = plan.slice(0, limit ?? DEFAULT_STOPS);
    const toVisit = shown.filter((visit) => visit.needsVisit);
    const [first] = toVisit;
    return {
      ok: true as const,
      summary: TH.visitPlan.summary(toVisit.length),
      metrics: first ? [{ label: TH.visitPlan.first, value: first.stop.agent, detail: first.stop.reason }] : [],
      rows: fencedRows(shown.map((visit, index) => rowOf(visit, index + 1, dictionary))),
      provenance: { sourceSystem: TH.visitPlan.source, asOf: businessToday(), masked: [] },
    };
  },
});
