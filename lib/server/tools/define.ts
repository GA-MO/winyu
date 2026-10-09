import type { z } from "zod";
import type { NativeConnectorId, NativeToolName, RoleId, ToolSurfaceEntry, ToolTier } from "@/lib/contracts";
import { gated, type CallRef, type GatedTool } from "@/lib/harness/gateway";
import { LIMITS } from "@/lib/harness/limits";
import type { Capability, Corrector, Readiness, Verifier } from "@/lib/harness/types";
import { TH } from "@/lib/i18n/th";

/** A tool as every engine sees it: its place on the surface, its capability, a description and a zod input read on demand, and the gateway as its only execute. */
export type WinyuTool<Name extends string = string> = {
  entry: ToolSurfaceEntry & { name: Name };
  capability: Capability;
  description: () => string;
  inputSchema: () => z.ZodType;
  execute: GatedTool<unknown>;
};

type NativeToolSpec<Name extends NativeToolName, Input extends z.ZodType> = {
  name: Name;
  connector: NativeConnectorId;
  tier: ToolTier;
  roles: readonly RoleId[] | "all";
  description: string | (() => string);
  input: Input;
  execute: (input: z.infer<Input>, call: CallRef) => Promise<unknown>;
  ready?: Readiness;
  verify?: Verifier;
  correct?: Corrector;
  redact?: readonly string[];
  timeoutMs?: number;
};

/** One tool of Winyu's own: its place on the surface (connector, tier, roles), its post-condition, and an execute that only runs through the harness gateway. */
export function defineTool<Name extends NativeToolName, Input extends z.ZodType>(spec: NativeToolSpec<Name, Input>): WinyuTool<Name> {
  const copy = TH.admin.tools[spec.name];
  const entry = { name: spec.name, connector: spec.connector, tier: spec.tier, roles: spec.roles, labelTh: copy.label, bodyTh: copy.body };
  const capability: Capability = { ...entry, timeoutMs: spec.timeoutMs ?? LIMITS.toolTimeoutMs, ready: spec.ready ?? null, verify: spec.verify ?? null, correct: spec.correct ?? null, redact: spec.redact ?? [] };
  const describe = spec.description;
  return {
    entry,
    capability,
    description: () => (typeof describe === "string" ? describe : describe()),
    inputSchema: () => spec.input,
    execute: gated(capability, spec.execute) as GatedTool<unknown>,
  };
}
