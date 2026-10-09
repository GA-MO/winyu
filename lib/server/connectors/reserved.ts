import { NATIVE_TOOL_NAMES } from "@/lib/contracts";
import type { ReservedReason } from "@/lib/connectors/spec";

/** Why a console connector may not open this remote tool: it is named like one of Winyu's own tools; null when it may. */
export function reservedReasonOf(tool: string): ReservedReason | null {
  return (NATIVE_TOOL_NAMES as readonly string[]).includes(tool) ? "native_tool" : null;
}
