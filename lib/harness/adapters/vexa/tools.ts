import type { Tool } from "ai";
import type { GatedTool } from "@/lib/harness/gateway";
import { approvalOf } from "@/lib/harness/approval";
import type { Capability } from "@/lib/harness/types";

type EngineToolSpec<Input, Output> = { capability: Capability; description: () => string; inputSchema: () => unknown; execute: GatedTool<Input, Output>; asksApproval: (input: Input) => boolean };

/** The AI SDK tool the engine hands the model: description and schema read on demand, approval from the capability's risk unless the policy refuses the call anyway, and the gateway as its only execute. */
export function engineTool<Input, Output>({ capability, description, inputSchema, execute, asksApproval }: EngineToolSpec<Input, Output>): Tool {
  return {
    get description() {
      return description();
    },
    get inputSchema() {
      return inputSchema();
    },
    ...(approvalOf(capability.tier) === "required" ? { needsApproval: asksApproval } : {}),
    execute: (input: Input, options: { toolCallId?: string }) => execute(input, { toolCallId: options?.toolCallId }),
  } as unknown as Tool;
}
