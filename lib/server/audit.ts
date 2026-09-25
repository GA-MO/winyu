import { createHash, randomUUID } from "node:crypto";
import type { AuditEntry } from "@/lib/contracts";
import { currentAccess, currentTurn } from "@/lib/server/request-context";
import { collection } from "@/lib/server/store/json-store";

export const AUDIT_COLLECTION = "audit";

const HASH_LENGTH = 16;
const ARGS_MAX_CHARS = 400;
const ARG_VALUE_MAX_CHARS = 80;
const REASON_MAX_CHARS = 300;
const THROWN_CODE = "ERROR";
const DENIED_CODES = ["PERMISSION_DENIED", "TOOL_NOT_ALLOWED"];

type ToolOutput = {
  ok?: unknown;
  code?: unknown;
  error?: unknown;
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

function shortened(value: unknown): unknown {
  if (typeof value === "string") return value.length > ARG_VALUE_MAX_CHARS ? `${value.slice(0, ARG_VALUE_MAX_CHARS)}…` : value;
  if (Array.isArray(value)) return value.map(shortened);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, shortened(inner)]));
  return value;
}

/** The arguments as the admin reads them in the audit: long text cut short, the whole capped. */
export function argsPreview(args: unknown): string {
  try {
    return JSON.stringify(shortened(args ?? null)).slice(0, ARGS_MAX_CHARS);
  } catch {
    return "";
  }
}

type Outcome = { code?: string; reason?: string };

function outcomeOf(output: unknown): Outcome {
  const result = output as ToolOutput | null;
  if (!result || typeof result !== "object") return {};
  if (result.ok !== false) return typeof result.code === "string" ? { code: result.code } : {};
  return { code: typeof result.code === "string" ? result.code : undefined, reason: typeof result.error === "string" ? result.error.slice(0, REASON_MAX_CHARS) : undefined };
}

function write(call: Call, output: unknown, thrown?: Outcome) {
  const { tool, connector, userId, args, startedAt } = call;
  const turn = currentTurn();
  const outcome = thrown ?? outcomeOf(output);
  auditLog().put({
    id: randomUUID(),
    at: new Date().toISOString(),
    userId,
    tool,
    connector,
    argsHash: argsHash(args),
    decision: thrown ? "deny" : decisionOf(output),
    rowsReturned: rowsOf(output),
    latencyMs: Date.now() - startedAt,
    ...(outcome.code ? { code: outcome.code } : {}),
    ...(outcome.reason ? { reason: outcome.reason } : {}),
    args: argsPreview(args),
    ...(turn.turnId ? { turnId: turn.turnId } : {}),
    ...(turn.threadId ? { threadId: turn.threadId } : {}),
    ...(turn.question ? { question: turn.question } : {}),
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
      write(call, null, { code: THROWN_CODE, reason: (error instanceof Error ? error.message : String(error)).slice(0, REASON_MAX_CHARS) });
      throw error;
    }
  };
}
