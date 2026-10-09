import type { z } from "zod";
import { storeVisitsInputSchema } from "@/lib/contracts";
import { currentAccess } from "@/lib/server/request-context";
import { storeVisitsFor } from "@/lib/server/store-visits";
import { defineTool } from "./define";

export const storeVisitsTool = defineTool({
  name: "store_visits",
  connector: "crm",
  tier: "read",
  roles: ["ceo", "sales_director", "sales_rsm", "sales_rep", "marketing_lead"],
  description:
    "Store visits from the CRM: when the sales team last visited an agent, who went, what came of it and the order taken, newest first, only in the caller's regions. agentId picks one agent (resolve a name with describe_entity first); null lists every agent the caller covers. Call it for เยี่ยมร้าน / ไปเยี่ยมเอเย่นต์ล่าสุดเมื่อไร questions. Not for sales numbers (query_metric).",
  input: storeVisitsInputSchema,
  execute: async ({ agentId }: z.infer<typeof storeVisitsInputSchema>) => storeVisitsFor(currentAccess(), agentId),
});
