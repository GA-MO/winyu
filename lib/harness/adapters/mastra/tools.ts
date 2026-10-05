import { createTool } from "@mastra/core/tools";
import type { ToolsInput } from "@mastra/core/agent";
import type { AccessContext } from "@/lib/contracts";
import { approvalOf } from "@/lib/harness/approval";
import { asksApproval } from "@/lib/harness/gateway";
import { accessOrNull, runWithAccess } from "@/lib/server/request-context";
import type { WinyuTool } from "@/lib/server/tools/define";

function inAccess<T>(access: AccessContext, work: () => T): T {
  return accessOrNull() ? work() : runWithAccess(access, work);
}

function mastraToolOf(winyuTool: WinyuTool, access: AccessContext) {
  const { capability, execute } = winyuTool;
  const approval = approvalOf(capability.tier) === "required" ? { requireApproval: (input: unknown) => inAccess(access, () => asksApproval(capability, input)) } : {};
  return createTool({
    id: winyuTool.entry.name,
    description: winyuTool.description(),
    inputSchema: winyuTool.inputSchema(),
    ...approval,
    execute: (input: unknown, context) => inAccess(access, () => execute(input, { toolCallId: context.agent?.toolCallId })),
  });
}

/** Neutral tools as a Mastra tool set: approval only for a call the policy would let through (reads never), and the gateway as the only execute. A call that runs outside the chat request's scope (Studio's background thread runs) is gated in the access the tools were resolved for. */
export function mastraTools(tools: readonly WinyuTool[], access: AccessContext): ToolsInput {
  return Object.fromEntries(tools.map((winyuTool) => [winyuTool.entry.name, mastraToolOf(winyuTool, access)]));
}
