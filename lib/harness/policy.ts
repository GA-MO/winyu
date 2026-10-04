import type { AccessContext, Initiator } from "@/lib/contracts";
import { isToolAllowed, withAdminSwitches } from "@/lib/access/enforce";
import { factsOf, ruleThatDenies } from "@/lib/access/policy-rules";
import { TH } from "@/lib/i18n/th";
import { approvalOf } from "./approval";
import type { Capability, PolicyDecision } from "./types";

/** What the policy reads about the call beyond the tool: the arguments as sent, who started the work, and the run's tool budget. */
export type CallContext = { input: unknown; initiator: Initiator; used: number; limit: number };

function allowedNow(access: AccessContext, name: string): boolean {
  return isToolAllowed(access, name) && isToolAllowed(withAdminSwitches(access), name);
}

/** The one decision on a tool call, in code: the caller's grant and the admin's live switches, then the admin's deny rules, then the run's tool budget, then whether it needs approval. */
export function authorize(access: AccessContext, capability: Capability, call: CallContext): PolicyDecision {
  if (!allowedNow(access, capability.name)) return { decision: "deny", code: "TOOL_NOT_ALLOWED", reason: TH.admin.connectors.notAllowed(capability.labelTh) };
  const denial = ruleThatDenies(factsOf(access, capability, call.input, call.initiator));
  if (denial) {
    const { id, name } = denial.rule;
    return { decision: "deny", code: "POLICY_RULE", reason: denial.broken ? TH.harness.policyRuleBroken(name) : TH.harness.policyRule(name), rule: { id, name } };
  }
  if (call.used >= call.limit) return { decision: "deny", code: "RUN_LIMIT", reason: TH.harness.runLimit(call.limit) };
  return approvalOf(capability.tier) === "required" ? { decision: "require_approval" } : { decision: "allow" };
}
