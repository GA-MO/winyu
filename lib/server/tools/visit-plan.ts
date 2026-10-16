import type { z } from "zod";
import { visitPlanInputSchema } from "@/lib/contracts";
import { businessToday } from "@/lib/data/dates";
import { TH } from "@/lib/i18n/th";
import { fencedRows } from "@/lib/server/connectors/output";
import { VISIT_ROLES, visitsFor } from "@/lib/server/dashboard";
import { currentAccess } from "@/lib/server/request-context";
import { defineTool } from "./define";

const DEFAULT_STOPS = 5;

export const visitPlanTool = defineTool({
  name: "visit_plan",
  connector: "warehouse",
  tier: "read",
  roles: VISIT_ROLES,
  description:
    "The agents the field rep should visit first, ranked now: agents with an open anomaly first, then the steepest sell-in drop over the last 4 weeks, each with its reason, only in the rep's own scope. limit is how many stops (null = 5). Call it for ควรไปเอเย่นต์ไหนก่อน / แผนเยี่ยมวันนี้ / ลำดับการเยี่ยม. Not store_visits, which lists visits already made.",
  input: visitPlanInputSchema,
  execute: async ({ limit }: z.infer<typeof visitPlanInputSchema>) => {
    const stops = await visitsFor(currentAccess(), limit ?? DEFAULT_STOPS);
    return {
      ok: true as const,
      summary: TH.visitPlan.summary(stops.length),
      rows: fencedRows(stops.map((stop, index) => ({ order: index + 1, agent_name: stop.agent, reason: stop.reason }))),
      provenance: { sourceSystem: TH.visitPlan.source, asOf: businessToday(), masked: [] },
    };
  },
});
