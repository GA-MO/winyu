import { createTool } from "@mastra/core/tools";
import type { ToolsInput } from "@mastra/core/agent";
import { approvalOf } from "@/lib/harness/approval";
import { asksApproval } from "@/lib/harness/gateway";
import type { WinyuTool } from "@/lib/server/tools/define";

function mastraToolOf(winyuTool: WinyuTool) {
  const { capability, execute, modelOutput } = winyuTool;
  const approval = approvalOf(capability.tier) === "required" ? { requireApproval: (input: unknown) => asksApproval(capability, input) } : {};
  return createTool({
    id: winyuTool.entry.name,
    description: winyuTool.description(),
    inputSchema: winyuTool.inputSchema(),
    ...approval,
    ...(modelOutput ? { toModelOutput: modelOutput } : {}),
    execute: (input: unknown, context) => execute(input, { toolCallId: context.agent?.toolCallId }),
  });
}

/** Neutral tools as a Mastra tool set: approval only for a call the policy would let through (reads never), and the gateway as the only execute. */
export function mastraTools(tools: readonly WinyuTool[]): ToolsInput {
  return Object.fromEntries(tools.map((winyuTool) => [winyuTool.entry.name, mastraToolOf(winyuTool)]));
}
