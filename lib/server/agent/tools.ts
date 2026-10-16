import { z } from "zod";
import { askableMetrics } from "@/lib/access/grants";
import { toolsFor } from "@/lib/access/enforce";
import { explainGapInputSchema, getForecastInputSchema, metricQueryInputSchema, type AccessContext, type MetricId, type ToolTier } from "@/lib/contracts";
import type { WinyuTool } from "@/lib/server/tools/define";
import { winyuTool, toolSurface } from "@/lib/server/tools/registry";

const METRIC_INPUTS: Readonly<Record<string, (metric: z.ZodType<MetricId>) => z.ZodType>> = {
  query_metric: (metric) => metricQueryInputSchema.extend({ metric }),
  explain_gap: (metric) => explainGapInputSchema.extend({ metric }),
  get_forecast: (metric) => getForecastInputSchema.extend({ metric }),
};

function winyuToolOf(name: string): WinyuTool {
  const found = winyuTool(name);
  if (!found) throw new Error(`tool ${name} is on the surface without an executable`);
  return found;
}

/** Every tool's tier by name, for approval and audit wiring. */
export function toolTiers(): Record<string, ToolTier> {
  return Object.fromEntries(toolSurface().map((entry) => [entry.name, entry.tier]));
}

/** The whole surface as engine-neutral tools by name, before any policy. */
export function winyuTools(): Record<string, WinyuTool> {
  return Object.fromEntries(toolSurface().map((entry) => [entry.name, winyuToolOf(entry.name)]));
}

function withAskableMetrics(tool: WinyuTool, metrics: MetricId[]): WinyuTool[] {
  const narrowed = METRIC_INPUTS[tool.entry.name];
  if (!narrowed) return [tool];
  if (metrics.length === 0) return [];
  const metric = z.enum(metrics as [MetricId, ...MetricId[]]);
  return [{ ...tool, inputSchema: () => narrowed(metric) }];
}

/** The tools one person's agent gets: the surface minus what the policy and the kill switch withhold, with every metric argument offering only the metrics this person may ask about. */
export function toolsForAccess(access: AccessContext): WinyuTool[] {
  const metrics = askableMetrics(access, new Date());
  return toolsFor(access).flatMap((name) => {
    const tool = winyuTool(name);
    return tool ? withAskableMetrics(tool, metrics) : [];
  });
}
