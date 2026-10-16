import type { Alert, AlertRow, Dim } from "@/lib/contracts";
import type { Dictionary } from "@/lib/semantic/dictionary";
import { formatMetricValue, metricFormat, metricLabel } from "@/lib/dashboard/metric-display";
import { formatDateTh, formatNumber, formatPercent } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { WATCHES, type Watch } from "@/lib/engine/watches";
import { RATIO_METRICS } from "@/lib/semantic/metrics";

const SCOPE_ORDER: readonly Dim[] = ["agent", "dc", "plant", "sku", "brand", "channel", "province", "region"];
const PERCENT = 100;
const BRAND_SEPARATOR = ", ";
const BRANDS_NAMED = 2;

/** The Thai scope of an alert — "ส.รุ่งเรือง เทรดดิ้ง · สิงห์ · ภาคอีสาน" — never the raw dimension ids. */
export function alertScopeLabel(alert: Alert, dictionary: Dictionary): string {
  const parts = SCOPE_ORDER.filter((dim) => alert.dims[dim] && !(dim === "brand" && alert.dims.sku)).map((dim) =>
    dictionary.displayLabel(dim, alert.dims[dim] as string),
  );
  const brands = alert.brands ?? [];
  const named = brands.slice(0, BRANDS_NAMED).map((brand) => dictionary.displayLabel("brand", brand)).join(BRAND_SEPARATOR);
  if (named && alert.dims.agent) parts.splice(1, 0, TH.dash.someBrands(named, brands.length - BRANDS_NAMED));
  return parts.length > 0 ? parts.join(" · ") : metricLabel(alert.metric);
}

function watchOf(alert: Alert): Watch | undefined {
  return WATCHES.find((entry) => entry.metric === alert.metric && entry.entityDims.every((dim) => alert.dims[dim] || (dim === "brand" && alert.brands)));
}

/** A daily watch on a flow (litres sold, output) scans the mean of a day, not the window's total. */
function readPerDay(watch: Watch | undefined): boolean {
  return watch?.grain === "day" && watch.lowThreshold === null && watch.transform === "none" && !RATIO_METRICS.has(watch.metric);
}

function valueLabelOf(alert: Alert, value: number): string {
  const watch = watchOf(alert);
  if (watch?.transform === "year_over_year") return TH.dash.timesLastYear(formatNumber(value));
  const label = formatMetricValue(alert.metric, value);
  return readPerDay(watch) ? TH.dash.perDay(label) : label;
}

const POINT_DECIMALS = 1;

function gapLabelOf(alert: Alert): string | null {
  if (metricFormat(alert.metric) === "percent") return TH.dash.points(Math.abs(alert.observed - alert.expected).toFixed(POINT_DECIMALS));
  if (alert.expected === 0) return null;
  return formatPercent(Math.round(Math.abs((alert.observed - alert.expected) / alert.expected) * PERCENT));
}

/** One anomaly with every label already formatted, so no consumer — model, card or drawer — re-derives them. */
export function alertRowOf(alert: Alert, dictionary: Dictionary): AlertRow {
  return {
    id: alert.id,
    severity: alert.severity,
    severityLabel: TH.severity[alert.severity],
    metric: alert.metric,
    metricLabel: metricLabel(alert.metric),
    scope: alert.dims,
    scopeLabel: alertScopeLabel(alert, dictionary),
    window: `${formatDateTh(alert.window.from)} – ${formatDateTh(alert.window.to)}`,
    observedLabel: valueLabelOf(alert, alert.observed),
    expectedLabel: valueLabelOf(alert, alert.expected),
    gapLabel: gapLabelOf(alert),
    yearOverYear: watchOf(alert)?.transform === "year_over_year",
    direction: alert.direction,
    hypothesis: alert.hypothesis,
    ownerUserId: alert.ownerUserId,
  };
}
