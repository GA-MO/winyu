import { tool as aiTool, type ToolSet } from "ai";
import { approvalOf } from "@/lib/harness/approval";
import { asksApproval } from "@/lib/harness/gateway";
import type { WinyuTool } from "@/lib/server/tools/define";

function aiSdkToolOf(winyuTool: WinyuTool) {
  const { capability, execute } = winyuTool;
  const needsApproval = approvalOf(capability.tier) === "required" ? { needsApproval: (input: unknown) => asksApproval(capability, input) } : {};
  return aiTool({
    description: winyuTool.description(),
    inputSchema: winyuTool.inputSchema(),
    ...needsApproval,
    execute: (input: unknown, options: { toolCallId: string }) => execute(input, { toolCallId: options.toolCallId }),
  });
}

/** Neutral tools as an AI SDK tool set: approval from the capability's risk unless the policy refuses the call anyway, and the gateway as the only execute. */
export function aiSdkTools(tools: readonly WinyuTool[]): ToolSet {
  return Object.fromEntries(tools.map((winyuTool) => [winyuTool.entry.name, aiSdkToolOf(winyuTool)]));
}
