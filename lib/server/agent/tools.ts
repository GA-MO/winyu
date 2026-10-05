import { toolsFor } from "@/lib/access/enforce";
import type { AccessContext, ToolTier } from "@/lib/contracts";
import type { WinyuTool } from "@/lib/server/tools/define";
import { winyuTool, toolSurface } from "@/lib/server/tools/registry";

function winyuToolOf(name: string): WinyuTool {
  const found = winyuTool(name);
  if (!found) throw new Error(`tool ${name} is on the surface without an executable`);
  return found;
}

/** Every tool's tier by name, for approval and audit wiring. */
export function toolTiers(): Record<string, ToolTier> {
  return Object.fromEntries(toolSurface().map((entry) => [entry.name, entry.tier]));
}

/** The whole surface as engine-neutral tools by name, before any policy. */
export function winyuTools(): Record<string, WinyuTool> {
  return Object.fromEntries(toolSurface().map((entry) => [entry.name, winyuToolOf(entry.name)]));
}

/** The tools one person's agent gets: the surface minus what the policy and the kill switch withhold. */
export function toolsForAccess(access: AccessContext): WinyuTool[] {
  return toolsFor(access).flatMap((name) => winyuTool(name) ?? []);
}
