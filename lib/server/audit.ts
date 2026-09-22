import { createHash, randomUUID } from "node:crypto";
import type { AuditEntry } from "@/lib/contracts";
import { currentAccess } from "@/lib/server/request-context";
import { collection } from "@/lib/server/store/json-store";

export const AUDIT_COLLECTION = "audit";

const HASH_LENGTH = 16;
const DENIED_CODES = ["PERMISSION_DENIED", "TOOL_NOT_ALLOWED"];

type ToolOutput = {
  ok?: unknown;
  code?: unknown;
  rows?: unknown;
  data?: unknown;
  provenance?: { masked?: unknown };
};

export function auditLog() {
  return collection<AuditEntry>(AUDIT_COLLECTION);
}

export function argsHash(args: unknown): string {
  return createHash("sha256").update(JSON.stringify(args ?? null)).digest("hex").slice(0, HASH_LENGTH);
}

function decisionOf(output: unknown): AuditEntry["decision"] {
  const result = output as ToolOutput | null;
  if (!result || typeof result !== "object") return "allow";
  if (result.ok === false) return DENIED_CODES.includes(String(result.code)) ? "deny" : "allow";
  const masked = result.provenance?.masked;
  if (Array.isArray(masked) && masked.length > 0) return "masked";
  return "allow";
}

function rowsOf(output: unknown): number {
  const result = output as ToolOutput | null;
  if (!result || typeof result !== "object") return 0;
  if (Array.isArray(result.rows)) return result.rows.length;
  if (Array.isArray(result.data)) return result.data.length;
  return result.ok === true ? 1 : 0;
}

function write(tool: string, userId: string, args: unknown, output: unknown, startedAt: number, decision?: AuditEntry["decision"]) {
  auditLog().put({
    id: randomUUID(),
    at: new Date().toISOString(),
    userId,
    tool,
    argsHash: argsHash(args),
    decision: decision ?? decisionOf(output),
    rowsReturned: rowsOf(output),
    latencyMs: Date.now() - startedAt,
  });
}

/** Wraps a tool execute so every call leaves one `AuditEntry`: who, which tool, hashed args, decision, rows, latency. */
export function withAudit<Args, Result>(tool: string, execute: (args: Args) => Promise<Result>): (args: Args) => Promise<Result> {
  return async (args: Args) => {
    const startedAt = Date.now();
    const { userId } = currentAccess();
    try {
      const output = await execute(args);
      write(tool, userId, args, output, startedAt);
      return output;
    } catch (error) {
      write(tool, userId, args, null, startedAt, "deny");
      throw error;
    }
  };
}
