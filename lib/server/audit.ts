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

type Call = { tool: string; connector: string; userId: string; args: unknown; startedAt: number };

function write(call: Call, output: unknown, decision?: AuditEntry["decision"]) {
  const { tool, connector, userId, args, startedAt } = call;
  auditLog().put({
    id: randomUUID(),
    at: new Date().toISOString(),
    userId,
    tool,
    connector,
    argsHash: argsHash(args),
    decision: decision ?? decisionOf(output),
    rowsReturned: rowsOf(output),
    latencyMs: Date.now() - startedAt,
  });
}

/** Wraps a tool execute so every call leaves one `AuditEntry`: who, which tool through which connector, hashed args, decision, rows, latency. */
export function withAudit<Args, Result>(tool: string, connector: string, execute: (args: Args) => Promise<Result>): (args: Args) => Promise<Result> {
  return async (args: Args) => {
    const call = { tool, connector, userId: currentAccess().userId, args, startedAt: Date.now() };
    try {
      const output = await execute(args);
      write(call, output);
      return output;
    } catch (error) {
      write(call, null, "deny");
      throw error;
    }
  };
}
