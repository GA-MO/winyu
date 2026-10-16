import type { z } from "zod";
import { metricAccess } from "@/lib/access/grants";
import { getForecastInputSchema } from "@/lib/contracts";
import { formatMetricValue, metricLabel } from "@/lib/dashboard/metric-display";
import { addDays, formatThaiDate, weekKeyOfIso } from "@/lib/data/dates";
import { ADDITIVE_FORECAST_METRICS, forecastSlice } from "@/lib/engine/forecast-slice";
import { periodLabelTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { forecastsFor } from "@/lib/server/alerts";
import { currentAccess } from "@/lib/server/request-context";
import { defineTool } from "./define";

const NO_FORECAST = "ยังไม่มีพยากรณ์สำหรับมิติที่ขอ";
const DAYS_PER_WEEK = 7;
const THURSDAY_OFFSET = 3;

type ForecastWeek = { date: string };

/** A forecast week belongs to the month its Thursday falls in, the same rule ISO weeks use for years. */
function inMonth(week: ForecastWeek, month: string): boolean {
  return addDays(week.date, THURSDAY_OFFSET).startsWith(month);
}

function spanOf(weeks: readonly ForecastWeek[]): string {
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  return first && last ? TH.forecastTool.span(formatThaiDate(first.date), formatThaiDate(addDays(last.date, DAYS_PER_WEEK - 1))) : "";
}

export const getForecastTool = defineTool({
  name: "get_forecast",
  connector: "winyu",
  tier: "read",
  roles: "all",
  description: "Read the deterministic forecast for a metric and dimension slice over the next weeks, with its confidence band and MAPE. Call it when the user asks what will happen, whether stock lasts, or about a plan for coming weeks. When the user names a month, set month (YYYY-MM): only that month's weeks come back and the summary gives their dates.",
  input: getForecastInputSchema,
  execute: async ({ metric, dims, weeks, month }: z.infer<typeof getForecastInputSchema>) => {
    const { access, grant } = metricAccess(currentAccess(), metric, new Date());
    const slice = forecastSlice(forecastsFor(access), metric, dims);
    if (!slice) return { ok: true as const, summary: NO_FORECAST, weeks: [] };
    if (!slice.ok) return { ok: true as const, summary: `${NO_FORECAST} ต้องระบุ ${slice.missingDims.join(", ")} ด้วย เพราะรวมข้ามกันไม่ได้`, weeks: [] };
    const chosen = month ? slice.points.filter((point) => inMonth(point, month)) : slice.points.slice(0, weeks);
    if (chosen.length === 0) return { ok: true as const, summary: month ? TH.forecastTool.outsideMonth(periodLabelTh(month), spanOf(slice.points)) : NO_FORECAST, weeks: [] };
    const points = chosen.map((point) => ({
      week: periodLabelTh(weekKeyOfIso(point.date)),
      date: point.date,
      value: Math.round(point.value),
      lo: Math.round(point.lo),
      hi: Math.round(point.hi),
      value_label: formatMetricValue(metric, Math.round(point.value)),
      range_label: `${formatMetricValue(metric, Math.round(point.lo))} – ${formatMetricValue(metric, Math.round(point.hi))}`,
    }));
    const total = points.reduce((sum, point) => sum + point.value, 0);
    const combined = slice.seriesCount > 1 ? ` · รวม ${slice.seriesCount} ชุดพยากรณ์ย่อย` : "";
    const additive = ADDITIVE_FORECAST_METRICS.has(metric);
    const average = points.length > 0 ? Math.round(total / points.length) : 0;
    const totalLine = additive ? ` · รวม ${points.length} สัปดาห์ ${formatMetricValue(metric, total)} · เฉลี่ยสัปดาห์ละ ${formatMetricValue(metric, average)}` : "";
    return {
      ok: true as const,
      metric,
      summary: `พยากรณ์ ${points.length} สัปดาห์ของ${metricLabel(metric)}${month ? TH.forecastTool.monthWeeks(periodLabelTh(month)) : ""} (${spanOf(chosen)})${combined}${totalLine} (Holt-Winters · ความคลาดเคลื่อนย้อนหลัง MAPE ${slice.mape}%)`,
      total: additive ? total : null,
      weekly_average: additive ? average : null,
      mape: slice.mape,
      weeks: points,
      ...(grant ? { provenance: { grant } } : {}),
    };
  },
});
