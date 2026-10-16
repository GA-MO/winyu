import { z } from "zod";
import type { MetricQuery } from "./semantic";

export type WidgetKind = "metric" | "bar" | "line" | "table" | "alert_list" | "kv" | "share" | "stacked" | "area" | "heatmap" | "month_end";
export type WidgetSort = "value_desc" | "value_asc" | "delta_asc" | "delta_desc";
export type WidgetSpec = { id: string; userId: string; title: string; kind: WidgetKind; query: MetricQuery; sortBy?: WidgetSort | null;
  pinned: boolean; position: number; source: "role_template" | "user_pin" | "ai_suggested"; reason: string | null;
  replaces?: string | null; createdAt: string; version: number };
export type DashboardLayout = { id: string; userId: string; version: number; widgets: WidgetSpec[]; updatedAt: string };

export const WIDGET_KINDS = ["metric", "bar", "line", "table", "alert_list", "kv", "share", "stacked", "area", "heatmap", "month_end"] as const satisfies readonly WidgetKind[];

/** How a pinned card is drawn; `month_end` draws a this-month query against target as where the month ends at the recent pace. */
export const widgetKindSchema = z.enum(WIDGET_KINDS).describe("How the card is drawn. month_end: where this month ends against its target at the recent pace (a this_month query with compare target); pin it when the user asks to keep where the month will close.");
