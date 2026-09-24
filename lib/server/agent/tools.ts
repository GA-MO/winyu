import type { ToolSet } from "ai";
import { toolsFor } from "@/lib/access/enforce";
import type { AccessContext, ToolTier } from "@/lib/contracts";
import { copTool, toolSurface } from "@/lib/server/tools/registry";

function copToolOf(name: string) {
  const found = copTool(name);
  if (!found) throw new Error(`tool ${name} is on the surface without an executable`);
  return found.tool;
}

/** Every tool's tier by name, for the handler's approval and audit wiring. */
export function toolTiers(): Record<string, ToolTier> {
  return Object.fromEntries(toolSurface().map((entry) => [entry.name, entry.tier]));
}

/** The whole surface as an AI SDK tool set, before any policy. */
export function copTools(): ToolSet {
  return Object.fromEntries(toolSurface().map((entry) => [entry.name, copToolOf(entry.name)]));
}

/** The tool set the handler gets for one role: the surface minus what the policy and the kill switch withhold. */
export function toolsForAccess(access: AccessContext): ToolSet {
  return Object.fromEntries(toolsFor(access).flatMap((name) => {
    const found = copTool(name);
    return found ? [[name, found.tool]] : [];
  }));
}
