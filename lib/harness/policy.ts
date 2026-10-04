import type { AccessContext } from "@/lib/contracts";
import { isToolAllowed, withAdminSwitches } from "@/lib/access/enforce";
import { TH } from "@/lib/i18n/th";
import { approvalOf } from "./approval";
import type { Capability, PolicyDecision } from "./types";

function allowedNow(access: AccessContext, name: string): boolean {
  return isToolAllowed(access, name) && isToolAllowed(withAdminSwitches(access), name);
}

/** The one decision on a tool call, in code: the caller's grant and the admin's live switches, then the run's tool budget, then whether it needs approval. */
export function authorize(access: AccessContext, capability: Capability, budget: { used: number; limit: number }): PolicyDecision {
  if (!allowedNow(access, capability.name)) return { decision: "deny", code: "TOOL_NOT_ALLOWED", reason: TH.admin.connectors.notAllowed(capability.labelTh) };
  if (budget.used >= budget.limit) return { decision: "deny", code: "RUN_LIMIT", reason: TH.harness.runLimit(budget.limit) };
  return approvalOf(capability.tier) === "required" ? { decision: "require_approval" } : { decision: "allow" };
}
