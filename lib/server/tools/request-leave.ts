import type { z } from "zod";
import { requestLeaveInputSchema } from "@/lib/contracts";
import { notReady } from "@/lib/harness/gateway";
import type { Unready } from "@/lib/harness/types";
import { TH } from "@/lib/i18n/th";
import { leaveProblemFor, requestLeave } from "@/lib/server/leave";
import { currentAccess, currentTurn } from "@/lib/server/request-context";
import { defineTool } from "./define";
import { leaveHolds } from "./verify";

async function unready(input: unknown): Promise<Unready | null> {
  const parsed = requestLeaveInputSchema.safeParse(input);
  if (!parsed.success) return notReady(TH.harness.notReady);
  const problem = await leaveProblemFor(currentAccess().userId, parsed.data);
  return problem ? notReady(problem) : null;
}

export const requestLeaveTool = defineTool({
  name: "request_leave",
  connector: "leave",
  tier: "write",
  roles: "all",
  description: "File a leave request in the user's own name after they filled the leave form or typed the dates (\"ขอลา… วันที่ 5–6 ต.ค.\" → call this right away, no get_policy first; a missing reason is an empty string): kind annual / sick / personal, from and to as YYYY-MM-DD, reason. The server counts working days, checks the balance and sends it to the manager's Inbox. The user approves it first.",
  input: requestLeaveInputSchema,
  ready: unready,
  redact: ["reason"],
  verify: leaveHolds,
  execute: async (input: z.infer<typeof requestLeaveInputSchema>, call) => requestLeave(currentAccess(), input, currentTurn().threadId, call.toolCallId),
});
