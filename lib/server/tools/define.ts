import type { Tool } from "ai";
import type { z } from "zod";
import type { NativeConnectorId, NativeToolName, RoleId, ToolSurfaceEntry, ToolTier } from "@/lib/contracts";
import { engineTool } from "@/lib/harness/adapters/vexa/tools";
import { asksApproval, gated } from "@/lib/harness/gateway";
import { LIMITS } from "@/lib/harness/limits";
import type { Capability, Corrector, Verifier } from "@/lib/harness/types";
import { TH } from "@/lib/i18n/th";

export type WinyuTool<Name extends string = string> = { entry: ToolSurfaceEntry & { name: Name }; capability: Capability; tool: Tool };

type NativeToolSpec<Name extends NativeToolName, Input extends z.ZodType> = {
  name: Name;
  connector: NativeConnectorId;
  tier: ToolTier;
  roles: readonly RoleId[] | "all";
  description: string | (() => string);
  input: Input;
  execute: (input: z.infer<Input>) => Promise<unknown>;
  verify?: Verifier;
  correct?: Corrector;
  redact?: readonly string[];
  timeoutMs?: number;
};

/** One tool of Winyu's own: its place on the surface (connector, tier, roles), its post-condition, and an execute that only runs through the harness gateway. */
export function defineTool<Name extends NativeToolName, Input extends z.ZodType>(spec: NativeToolSpec<Name, Input>): WinyuTool<Name> {
  const copy = TH.admin.tools[spec.name];
  const entry = { name: spec.name, connector: spec.connector, tier: spec.tier, roles: spec.roles, labelTh: copy.label, bodyTh: copy.body };
  const capability: Capability = { ...entry, timeoutMs: spec.timeoutMs ?? LIMITS.toolTimeoutMs, verify: spec.verify ?? null, correct: spec.correct ?? null, redact: spec.redact ?? [] };
  const describe = spec.description;
  const tool = engineTool({
    capability,
    description: () => (typeof describe === "string" ? describe : describe()),
    inputSchema: () => spec.input,
    execute: gated(capability, spec.execute),
    asksApproval: (input: z.output<Input>) => asksApproval(capability, input),
  });
  return { entry, capability, tool };
}
