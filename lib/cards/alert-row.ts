import type { Alert, AlertRow, Dim } from "@/lib/contracts";
import { displayLabel } from "@/lib/semantic/dictionary";
import { formatMetricValue, metricFormat, metricLabel } from "@/lib/dashboard/metric-display";
import { formatDateTh, formatNumber, formatPercent } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { WATCHES } from "@/lib/engine/watches";

const SCOPE_ORDER: readonly Dim[] = ["agent", "dc", "plant", "sku", "brand", "channel", "province", "region"];
const PERCENT = 100;

/** The Thai scope of an alert — "ส.รุ่งเรือง เทรดดิ้ง · สิงห์ · ภาคอีสาน" — never the raw dimension ids. */
export function alertScopeLabel(alert: Alert): string {
  const parts = SCOPE_ORDER.filter((dim) => alert.dims[dim] && !(dim === "brand" && alert.dims.sku)).map((dim) =>
    displayLabel(dim, alert.dims[dim] as string),
  );
  return parts.length > 0 ? parts.join(" · ") : metricLabel(alert.metric);
}

function measuredAgainstLastYear(alert: Alert): boolean {
  const watch = WATCHES.find((entry) => entry.metric === alert.metric && entry.entityDims.every((dim) => alert.dims[dim]));
  return watch?.transform === "year_over_year";
}

function valueLabelOf(alert: Alert, value: number): string {
  return measuredAgainstLastYear(alert) ? TH.dash.timesLastYear(formatNumber(value)) : formatMetricValue(alert.metric, value);
}

const POINT_DECIMALS = 1;

function gapLabelOf(alert: Alert): string | null {
  if (metricFormat(alert.metric) === "percent") return TH.dash.points(Math.abs(alert.observed - alert.expected).toFixed(POINT_DECIMALS));
  if (alert.expected === 0) return null;
  return formatPercent(Math.round(Math.abs((alert.observed - alert.expected) / alert.expected) * PERCENT));
}

/** One anomaly with every label already formatted, so no consumer — model, card or drawer — re-derives them. */
export function alertRowOf(alert: Alert): AlertRow {
  return {
    id: alert.id,
    severity: alert.severity,
    severityLabel: TH.severity[alert.severity],
    metric: alert.metric,
    metricLabel: metricLabel(alert.metric),
    scope: alert.dims,
    scopeLabel: alertScopeLabel(alert),
    window: `${formatDateTh(alert.window.from)} – ${formatDateTh(alert.window.to)}`,
    observedLabel: valueLabelOf(alert, alert.observed),
    expectedLabel: valueLabelOf(alert, alert.expected),
    gapLabel: gapLabelOf(alert),
    yearOverYear: measuredAgainstLastYear(alert),
    direction: alert.direction,
    hypothesis: alert.hypothesis,
    verifySteps: alert.verifySteps,
    ownerUserId: alert.ownerUserId,
  };
}
