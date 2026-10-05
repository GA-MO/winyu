import type { z } from "zod";
import { getPolicyInputSchema } from "@/lib/contracts";
import { policyFor } from "@/lib/server/leave";
import { currentAccess } from "@/lib/server/request-context";
import { defineTool } from "./define";

export const getPolicyTool = defineTool({
  name: "get_policy",
  connector: "leave",
  tier: "read",
  roles: "all",
  description: "Read company policy. topic leave: the viewer's own leave balances (annual, sick, personal) as headline numbers, the leave rules as sections, and the form options to file leave (kinds with days left, approver, earliest annual date). topic benefits: the benefit sections. Call it for วันลา / ลาพักร้อน / ลาป่วย / สวัสดิการ questions. Not when the user already asks to take leave on given dates: call request_leave directly.",
  input: getPolicyInputSchema,
  execute: async ({ topic }: z.infer<typeof getPolicyInputSchema>) => policyFor(currentAccess(), topic),
});
