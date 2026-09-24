import type { z } from "zod";
import { listMetricsInputSchema } from "@/lib/contracts";
import { dataPort } from "@/lib/server/agent/data-port";
import { defineTool } from "./define";

export const listMetricsTool = defineTool({
  name: "list_metrics",
  connector: "warehouse",
  tier: "read",
  roles: "all",
  description: "List the metrics this system can answer, with their Thai label, unit and synonyms. Call it when the user's wording is ambiguous or you are unsure a metric exists before querying it.",
  input: listMetricsInputSchema,
  execute: async ({ search }: z.infer<typeof listMetricsInputSchema>) => {
    const defs = dataPort().listMetrics(search);
    const data = defs.map((def) => ({ id: def.id, labelTh: def.labelTh, unit: def.unit, dims: def.dims, certified: def.certified }));
    return { ok: true as const, summary: `พบ ${data.length} เมตริกที่ตรงกับคำค้น`, data };
  },
});
