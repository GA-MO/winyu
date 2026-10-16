import type { AuditEntry } from "@/lib/contracts";
import { auditLog } from "@/lib/server/audit";
import { toolSurface } from "@/lib/server/tools/registry";

const DAY_MS = 86_400_000;

export type ToolActivity = { calls: number; failed: number; denied: number; masked: number };

/** The audit rows that are calls of a tool on the surface, since a moment when one is given; a composed card, share, matter press, guard decision, grant or connector edit is audited beside them but is not a tool call. */
export function toolCalls(entries: readonly AuditEntry[], since: string | null = null): AuditEntry[] {
  const names = new Set<string>(toolSurface().map((entry) => entry.name));
  return entries.filter((entry) => names.has(entry.tool) && (!since || entry.at >= since));
}

/** The start of the UTC day a number of days back: the window the console and the admin's audit tool both count from. */
export function sinceDaysStart(days: number, now = Date.now()): string {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  return new Date(start.getTime() - days * DAY_MS).toISOString();
}

/** How often each tool was called since a moment, and how many of those calls were refused, failed or masked; only tool calls count. */
export function toolActivity(since: string | null): Map<string, ToolActivity> {
  const table = new Map<string, ToolActivity>();
  for (const entry of toolCalls(auditLog().all(), since)) {
    const row = table.get(entry.tool) ?? { calls: 0, failed: 0, denied: 0, masked: 0 };
    row.calls += 1;
    if (entry.decision === "deny" || entry.code) row.failed += 1;
    if (entry.decision === "deny") row.denied += 1;
    if (entry.decision === "masked") row.masked += 1;
    table.set(entry.tool, row);
  }
  return table;
}
