import { randomUUID } from "node:crypto";
import type { Evidence, Observation, ObservationStatus } from "./types";

const REASON_MAX_CHARS = 300;
/** The code a tool call that threw is recorded under. */
export const THROWN_CODE = "ERROR";
const PARTIAL_CODES: ReadonlySet<string> = new Set(["SCOPE_TRIMMED", "NONE_IN_SCOPE"]);

type ToolOutput = { ok?: unknown; code?: unknown; error?: unknown; rows?: unknown; data?: unknown; provenance?: { masked?: unknown } };

/** How one attempt of a tool call ended: what it returned, or what it threw. */
export type Attempt = { returned: unknown } | { thrown: unknown };

function asOutput(value: unknown): ToolOutput | null {
  return value && typeof value === "object" ? (value as ToolOutput) : null;
}

function rowsOf(output: ToolOutput | null): number {
  if (!output) return 0;
  if (Array.isArray(output.rows)) return output.rows.length;
  if (Array.isArray(output.data)) return output.data.length;
  return output.ok === true ? 1 : 0;
}

function maskedOf(output: ToolOutput | null): string[] {
  const masked = output?.provenance?.masked;
  return Array.isArray(masked) ? masked.map(String) : [];
}

function evidenceOf(output: ToolOutput | null): Evidence {
  const code = typeof output?.code === "string" ? output.code : null;
  const reason = output?.ok === false && typeof output.error === "string" ? output.error.slice(0, REASON_MAX_CHARS) : null;
  return { code, reason, rows: rowsOf(output), masked: maskedOf(output) };
}

function statusOf(output: ToolOutput | null, evidence: Evidence): ObservationStatus {
  if (output?.ok === false) return "failed";
  if (evidence.masked.length > 0 || (evidence.code !== null && PARTIAL_CODES.has(evidence.code))) return "partial";
  return "success";
}

function thrownReason(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, REASON_MAX_CHARS);
}

/** What one attempt showed: success, partial (trimmed to scope or masked) or failed, with the code, reason, rows and masked fields; a throw is a failed ERROR. */
export function observe(actionId: string, source: string, attempt: Attempt): Observation {
  if ("thrown" in attempt) {
    return { id: randomUUID(), actionId, source, status: "failed", data: null, evidence: { code: THROWN_CODE, reason: thrownReason(attempt.thrown), rows: 0, masked: [] } };
  }
  const output = asOutput(attempt.returned);
  const evidence = evidenceOf(output);
  return { id: randomUUID(), actionId, source, status: statusOf(output, evidence), data: attempt.returned, evidence };
}
