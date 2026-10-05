import type { ToolTier } from "@/lib/contracts";
import type { ApprovalRule } from "./types";

/** Whether a tool of this risk waits for the person's yes: reads never, anything that changes something always. */
export function approvalOf(tier: ToolTier): ApprovalRule {
  return tier === "read" ? "never" : "required";
}
