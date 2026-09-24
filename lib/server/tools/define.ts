import { tool, type Tool } from "ai";
import type { z } from "zod";
import type { NativeConnectorId, NativeToolName, RoleId, ToolSurfaceEntry, ToolTier } from "@/lib/contracts";
import { withAudit } from "@/lib/server/audit";
import { TH } from "@/lib/i18n/th";

export type CopTool<Name extends string = string> = { entry: ToolSurfaceEntry & { name: Name }; tool: Tool };

type NativeToolSpec<Name extends NativeToolName, Input extends z.ZodType> = {
  name: Name;
  connector: NativeConnectorId;
  tier: ToolTier;
  roles: readonly RoleId[] | "all";
  description: string | (() => string);
  input: Input;
  execute: (input: z.infer<Input>) => Promise<unknown>;
};

/** One tool of Cop's own: its place on the surface (connector, tier, roles) and its audited execute; anything above read asks the user first. */
export function defineTool<Name extends NativeToolName, Input extends z.ZodType>(spec: NativeToolSpec<Name, Input>): CopTool<Name> {
  const copy = TH.admin.tools[spec.name];
  const entry = { name: spec.name, connector: spec.connector, tier: spec.tier, roles: spec.roles, labelTh: copy.label, bodyTh: copy.body };
  const describe = spec.description;
  const executable = tool({
    get description() {
      return typeof describe === "string" ? describe : describe();
    },
    inputSchema: spec.input,
    ...(spec.tier === "read" ? {} : { needsApproval: true }),
    execute: withAudit(spec.name, spec.connector, spec.execute),
  } as unknown as Parameters<typeof tool>[0]) as Tool;
  return { entry, tool: executable };
}
