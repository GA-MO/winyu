import type { z } from "zod";
import { requestLeaveInputSchema } from "@/lib/contracts";
import { requestLeave } from "@/lib/server/leave";
import { currentAccess, currentTurn } from "@/lib/server/request-context";
import { defineTool } from "./define";
import { leaveHolds } from "./verify";

export const requestLeaveTool = defineTool({
  name: "request_leave",
  connector: "leave",
  tier: "write",
  roles: "all",
  description: "File a leave request in the user's own name after they filled the leave form or typed the dates (\"ขอลา… วันที่ 5–6 ต.ค.\" → call this right away, no get_policy first; a missing reason is an empty string): kind annual / sick / personal, from and to as YYYY-MM-DD, reason. The server counts working days, checks the balance and sends it to the manager's Inbox. The user approves it first.",
  input: requestLeaveInputSchema,
  redact: ["reason"],
  verify: leaveHolds,
  execute: async (input: z.infer<typeof requestLeaveInputSchema>, call) => requestLeave(currentAccess(), input, currentTurn().threadId, call.toolCallId),
});
