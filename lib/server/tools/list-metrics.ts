import type { z } from "zod";
import { askableMetrics } from "@/lib/access/grants";
import { listMetricsInputSchema, type MetricDef } from "@/lib/contracts";
import { DATA_AS_OF } from "@/lib/data/dates";
import { LAST_AUDITED_MONTH_KEY } from "@/lib/data/market-share";
import { formatDateTh, periodLabelTh } from "@/lib/i18n/format";
import { ports } from "@/lib/server/ports";
import { currentAccess } from "@/lib/server/request-context";
import { defineTool } from "./define";

const AUDITED_METRICS: ReadonlySet<string> = new Set(["market_share"]);

function refreshOf(def: MetricDef): string {
  if (AUDITED_METRICS.has(def.id)) return "รอบสำรวจรายเดือน";
  if (def.dims.includes("date")) return "รายวัน";
  if (def.dims.includes("week")) return "รายสัปดาห์";
  return "รายเดือน";
}

function latestOf(def: MetricDef): string {
  return AUDITED_METRICS.has(def.id) ? `รอบ ${periodLabelTh(LAST_AUDITED_MONTH_KEY)}` : formatDateTh(DATA_AS_OF);
}

export const listMetricsTool = defineTool({
  name: "list_metrics",
  connector: "warehouse",
  tier: "read",
  roles: "all",
  description: "List the metrics this system can answer, with their Thai label, unit, source system, how often each refreshes and the latest data it holds. Call it when the user's wording is ambiguous, you are unsure a metric exists, or the user asks how fresh the data is.",
  input: listMetricsInputSchema,
  execute: async ({ search }: z.infer<typeof listMetricsInputSchema>) => {
    const askable = new Set(askableMetrics(currentAccess(), new Date()));
    const defs = (await ports().metrics.listMetrics(search)).filter((def) => askable.has(def.id));
    const data = defs.map((def) => ({ id: def.id, labelTh: def.labelTh, unit: def.unit, dims: def.dims, certified: def.certified, source: def.sourceSystem, refresh: refreshOf(def), latest: latestOf(def) }));
    return { ok: true as const, summary: `พบ ${data.length} เมตริกที่ตรงกับคำค้น`, data };
  },
});
