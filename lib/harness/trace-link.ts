import { createHash } from "node:crypto";

const TRACE_ID_HEX_CHARS = 32;

/** The local Studio's port (`bun run studio`). */
export const STUDIO_PORT = Number(process.env.MASCOP_STUDIO_PORT ?? 3213);

/** The Mastra trace id a harness run is recorded under: derived from the run id, so either side finds the other without a lookup table. */
export function traceIdOfRun(runId: string): string {
  return createHash("sha256").update(runId).digest("hex").slice(0, TRACE_ID_HEX_CHARS);
}

/** Where a developer opens a run's Mastra trace in the local Studio; null in production, where Studio does not exist. */
export function studioTraceUrl(runId: string): string | null {
  if (process.env.NODE_ENV === "production") return null;
  return `http://localhost:${STUDIO_PORT}/traces?traceId=${traceIdOfRun(runId)}`;
}
