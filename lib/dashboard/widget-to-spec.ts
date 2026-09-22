import type { Dim, MetricQuery, MetricResult, MetricRow, WidgetSpec } from "@/lib/contracts";
import type { Spec, SpecElement } from "vexa/protocol";
import { TH } from "@/lib/i18n/th";
import { addDays, monthKeyOfIso, weekKeyOfIso } from "@/lib/data/dates";
import { formatDateTh, periodLabelTh } from "@/lib/i18n/format";
import { formatMetricValue, metricFormat, metricLabel, metricUnit } from "./metric-display";

type Elements = Record<string, SpecElement>;
type Tone = "info" | "success" | "warning" | "danger";

const NEUTRAL_BAND = 0.02;
const MAX_TABLE_ROWS = 8;
const MAX_ALERTS = 4;
const ALERT_TONES: readonly Tone[] = ["danger", "warning", "info"];
const TIME_DIMS: readonly Dim[] = ["date", "week", "month"];
const SUNDAY = 0;

function element(type: string, props: Record<string, unknown>, children: string[] = []): SpecElement {
  return { type, props, children } as SpecElement;
}

function numericOf(row: MetricRow, key: string): number | null {
  const value = row[key];
  return typeof value === "number" ? value : null;
}

function trendOf(value: number | null, previous: number | null): "up" | "down" | "neutral" {
  if (value === null || previous === null || previous === 0) return "neutral";
  const delta = (value - previous) / Math.abs(previous);
  if (delta > NEUTRAL_BAND) return "up";
  if (delta < -NEUTRAL_BAND) return "down";
  return "neutral";
}

function deltaText(widget: WidgetSpec, row: MetricRow): string | null {
  const value = numericOf(row, "value");
  const previous = numericOf(row, "compare_value");
  if (value === null || previous === null || previous === 0) return null;
  const percent = Math.round(((value - previous) / Math.abs(previous)) * 1000) / 10;
  const sign = percent >= 0 ? "+" : "";
  const against = widget.query.compare === "target" ? "เทียบเป้า" : widget.query.compare === "prev_year" ? "เทียบปีก่อน" : "เทียบช่วงก่อน";
  return `${sign}${percent}% ${against}`;
}

function isTimeDim(dim: Dim): boolean {
  return TIME_DIMS.includes(dim);
}

function timeDimOf(query: MetricQuery): Dim | null {
  return query.dims.find(isTimeDim) ?? null;
}

function labelOf(widget: WidgetSpec, row: MetricRow): string {
  const parts = widget.query.dims
    .map((dim) => ({ dim, value: row[dim] }))
    .filter((part) => part.value !== null && part.value !== undefined && part.value !== "")
    .map((part) => (isTimeDim(part.dim) ? periodLabelTh(String(part.value)) : String(part.value)));
  return parts.length > 0 ? parts.join(" · ") : metricLabel(widget.query.metric);
}

function endsOnFullBucket(query: MetricQuery): boolean {
  if (query.grain === "month") return monthKeyOfIso(addDays(query.range.to, 1)) !== monthKeyOfIso(query.range.to);
  if (query.grain === "week") return new Date(`${query.range.to}T00:00:00Z`).getUTCDay() === SUNDAY;
  return true;
}

function partialBucketKey(query: MetricQuery): string | null {
  if (endsOnFullBucket(query)) return null;
  if (query.grain === "month") return monthKeyOfIso(query.range.to);
  if (query.grain === "week") return weekKeyOfIso(query.range.to);
  return null;
}

/** A trend whose last bucket is the running week or month drops that bucket and says so, instead of falling off a cliff. */
function withoutPartialBucket(widget: WidgetSpec, rows: MetricRow[]): { rows: MetricRow[]; note: string | null } {
  if (widget.kind !== "line" || rows.length < 2) return { rows, note: null };
  const dim = timeDimOf(widget.query);
  const key = partialBucketKey(widget.query);
  if (!dim || !key) return { rows, note: null };
  const last = rows[rows.length - 1];
  if (String(last[dim]) !== key) return { rows, note: null };
  return { rows: rows.slice(0, -1), note: widget.query.grain === "month" ? TH.dash.partialMonth : TH.dash.partialWeek };
}

function chartPoints(widget: WidgetSpec, rows: MetricRow[]): { label: string; value: number }[] {
  return rows
    .map((row) => ({ label: labelOf(widget, row), value: numericOf(row, "value") }))
    .filter((point): point is { label: string; value: number } => point.value !== null);
}

function provenanceLine(result: Extract<MetricResult, { ok: true }>): string {
  const trust = TH.dash.trust[result.provenance.trust];
  return TH.dash.provenance(result.provenance.sourceSystem, trust, formatDateTh(result.provenance.asOf));
}

function metricBody(id: string, widget: WidgetSpec, rows: MetricRow[]): Elements {
  const row = rows[0] ?? { value: null };
  const detail = deltaText(widget, row) ?? metricUnit(widget.query.metric);
  return {
    [id]: element("Metric", {
      label: labelOf(widget, row),
      value: formatMetricValue(widget.query.metric, row.value as number | string | null),
      detail,
      trend: trendOf(numericOf(row, "value"), numericOf(row, "compare_value")),
    }),
  };
}

function seriesFor(widget: WidgetSpec, rows: MetricRow[]) {
  const points = chartPoints(widget, rows);
  return {
    labels: points.map((point) => point.label),
    series: [{ name: metricLabel(widget.query.metric), values: points.map((point) => point.value) }],
    format: metricFormat(widget.query.metric),
  };
}

function barBody(id: string, widget: WidgetSpec, rows: MetricRow[]): Elements {
  const { labels, series, format } = seriesFor(widget, rows);
  return { [id]: element("BarChart", { title: null, labels, series, horizontal: true, stacked: false, showValues: true, format, height: "md" }) };
}

function lineBody(id: string, widget: WidgetSpec, rows: MetricRow[]): Elements {
  const { labels, series, format } = seriesFor(widget, rows);
  return { [id]: element("LineChart", { title: null, labels, series, area: true, showDots: false, format, height: "md" }) };
}

function tableBody(id: string, widget: WidgetSpec, rows: MetricRow[]): Elements {
  const withCompare = widget.query.compare !== "none";
  const columns = [
    { key: "label", label: "รายการ" },
    { key: "value", label: metricLabel(widget.query.metric) },
    ...(withCompare ? [{ key: "compare", label: "ช่วงก่อนหน้า" }] : []),
  ];
  const tableRows = rows.slice(0, MAX_TABLE_ROWS).map((row) => ({
    label: labelOf(widget, row),
    value: formatMetricValue(widget.query.metric, row.value as number | string | null),
    ...(withCompare ? { compare: formatMetricValue(widget.query.metric, row.compare_value as number | string | null) } : {}),
  }));
  return { [id]: element("Table", { columns, rows: tableRows }) };
}

function kvBody(id: string, widget: WidgetSpec, rows: MetricRow[]): Elements {
  const columns = [
    { key: "label", label: "รายการ" },
    { key: "value", label: metricLabel(widget.query.metric) },
  ];
  const tableRows = rows.slice(0, MAX_TABLE_ROWS).map((row) => ({
    label: labelOf(widget, row),
    value: formatMetricValue(widget.query.metric, row.value as number | string | null),
  }));
  return { [id]: element("Table", { columns, rows: tableRows }) };
}

function alertListBody(id: string, widget: WidgetSpec, rows: MetricRow[]): Elements {
  const items = rows.slice(0, MAX_ALERTS);
  const children = items.map((_, index) => `${id}-item-${index}`);
  const elements: Elements = { [id]: element("Stack", { direction: "vertical", gap: "sm" }, children) };
  items.forEach((row, index) => {
    const delta = deltaText(widget, row);
    elements[`${id}-item-${index}`] = element("Alert", {
      title: String(row.label ?? ""),
      body: `${formatMetricValue(widget.query.metric, row.value as number | string | null)}${delta ? ` · ${delta}` : ""}`,
      tone: ALERT_TONES[Math.min(index, ALERT_TONES.length - 1)],
    });
  });
  return elements;
}

function bodyFor(id: string, widget: WidgetSpec, rows: MetricRow[], masked: boolean): Elements {
  if (masked && widget.kind !== "metric") return kvBody(id, widget, rows);
  if (widget.kind === "metric") return metricBody(id, widget, rows);
  if (widget.kind === "bar") return barBody(id, widget, rows);
  if (widget.kind === "line") return lineBody(id, widget, rows);
  if (widget.kind === "table") return tableBody(id, widget, rows);
  if (widget.kind === "alert_list") return alertListBody(id, widget, rows);
  return kvBody(id, widget, rows);
}

function deniedSpec(widget: WidgetSpec, message: string): Spec {
  const root = `${widget.id}-root`;
  return {
    root,
    elements: {
      [root]: element("Card", { title: widget.title, description: null }, [`${widget.id}-denied`]),
      [`${widget.id}-denied`]: element("Alert", { title: TH.dash.denied, body: message, tone: "warning" }),
    },
  };
}

/** A widget plus the rows it resolved to, as a Vexa spec: stable element ids, a provenance line, masked and denied variants included. */
export function widgetToSpec(widget: WidgetSpec, result: MetricResult): Spec {
  if (!result.ok) return deniedSpec(widget, result.error);
  const root = `${widget.id}-root`;
  const bodyId = `${widget.id}-body`;
  const noteId = `${widget.id}-note`;
  const masked = result.provenance.masked.length > 0;
  const trimmed = withoutPartialBucket(widget, result.rows);
  const notes = [provenanceLine(result), masked ? TH.dash.maskedNote(result.provenance.masked.length) : null, trimmed.note]
    .filter((line): line is string => line !== null)
    .join(" · ");
  return {
    root,
    elements: {
      [root]: element("Card", { title: widget.title, description: result.summary }, [bodyId, noteId]),
      ...bodyFor(bodyId, widget, trimmed.rows, masked),
      [noteId]: element("Text", { content: notes, muted: true }),
    },
  };
}
