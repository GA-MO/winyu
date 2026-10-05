import { createTool } from "@mastra/core/tools";
import type { ToolsInput } from "@mastra/core/agent";
import type { AccessContext } from "@/lib/contracts";
import { approvalOf } from "@/lib/harness/approval";
import type { HarnessEvent } from "@/lib/harness/events";
import { asksApproval } from "@/lib/harness/gateway";
import { currentRun } from "@/lib/harness/runtime";
import { accessOrNull, runWithAccess } from "@/lib/server/request-context";
import type { WinyuTool } from "@/lib/server/tools/define";

function inAccess<T>(access: AccessContext, work: () => T): T {
  return accessOrNull() ? work() : runWithAccess(access, work);
}

type GatewayStep = { type: HarnessEvent["type"]; at: string; detail: Record<string, unknown> };

function gatewayStepsOf(toolCallId: string): GatewayStep[] {
  return (currentRun()?.events ?? []).flatMap((event) => {
    const payload: Record<string, unknown> = event.payload;
    if (payload.toolCallId !== toolCallId) return [];
    const { toolCallId: _ref, tool: _tool, ...detail } = payload;
    return [{ type: event.type, at: event.at, detail }];
  });
}

function mastraToolOf(winyuTool: WinyuTool, access: AccessContext) {
  const { capability, execute } = winyuTool;
  const approval = approvalOf(capability.tier) === "required" ? { requireApproval: (input: unknown) => inAccess(access, () => asksApproval(capability, input)) } : {};
  return createTool({
    id: winyuTool.entry.name,
    description: winyuTool.description(),
    inputSchema: winyuTool.inputSchema(),
    ...approval,
    execute: async (input: unknown, context) => {
      const toolCallId = context.agent?.toolCallId;
      const result = await inAccess(access, () => execute(input, { toolCallId }));
      if (toolCallId) context.tracingContext?.currentSpan?.update({ metadata: { gateway: gatewayStepsOf(toolCallId) } });
      return result;
    },
  });
}

/** Neutral tools as a Mastra tool set: approval only for a call the policy would let through (reads never), and the gateway as the only execute, whose decisions (authorized or denied, observed, verified, recovered) are written onto the call's Mastra span. A call that runs outside the chat request's scope (Studio's background thread runs) is gated in the access the tools were resolved for. */
export function mastraTools(tools: readonly WinyuTool[], access: AccessContext): ToolsInput {
  return Object.fromEntries(tools.map((winyuTool) => [winyuTool.entry.name, mastraToolOf(winyuTool, access)]));
}
