import { z } from "zod";
import { metricQuerySchema, type MetricQuery } from "./semantic";

export type WidgetKind = "metric" | "bar" | "line" | "table" | "alert_list" | "kv" | "share" | "stacked" | "area" | "heatmap";
export type WidgetSort = "value_desc" | "value_asc" | "delta_asc" | "delta_desc";
export type WidgetSpec = { id: string; userId: string; title: string; kind: WidgetKind; query: MetricQuery; sortBy?: WidgetSort | null;
  pinned: boolean; position: number; source: "role_template" | "user_pin" | "ai_suggested"; reason: string | null;
  createdAt: string; version: number };
export type DashboardLayout = { id: string; userId: string; version: number; widgets: WidgetSpec[]; updatedAt: string };

export const WIDGET_KINDS = ["metric", "bar", "line", "table", "alert_list", "kv", "share", "stacked", "area", "heatmap"] as const satisfies readonly WidgetKind[];
export const WIDGET_SOURCES = ["role_template", "user_pin", "ai_suggested"] as const;

export const widgetKindSchema = z.enum(WIDGET_KINDS);
export const widgetSpecSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  title: z.string().min(1),
  kind: widgetKindSchema,
  query: metricQuerySchema,
  sortBy: z.enum(["value_desc", "value_asc", "delta_asc", "delta_desc"]).nullable().optional(),
  pinned: z.boolean(),
  position: z.number().int().min(0),
  source: z.enum(WIDGET_SOURCES),
  reason: z.string().nullable(),
  createdAt: z.string(),
  version: z.number().int().min(0),
}) satisfies z.ZodType<WidgetSpec>;
