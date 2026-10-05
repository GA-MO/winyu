import { createHash, randomUUID } from "node:crypto";
import type { AuditEntry, Initiator, RuleRef } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { THROWN_CODE } from "@/lib/harness/observation";
import type { Observation } from "@/lib/harness/types";
import { currentTurn } from "@/lib/server/request-context";
import { collection } from "@/lib/server/store/json-store";

export const AUDIT_COLLECTION = "audit";

const HASH_LENGTH = 16;
const ARGS_MAX_CHARS = 400;
const ARG_VALUE_MAX_CHARS = 80;
const DENIED_CODES: ReadonlySet<string> = new Set(["PERMISSION_DENIED", "TOOL_NOT_ALLOWED", "POLICY_RULE", "RUN_LIMIT", "VERIFICATION_FAILED", THROWN_CODE]);

export function auditLog() {
  return collection<AuditEntry>(AUDIT_COLLECTION);
}

export function argsHash(args: unknown): string {
  return createHash("sha256").update(JSON.stringify(args ?? null)).digest("hex").slice(0, HASH_LENGTH);
}

function decisionOf(observation: Observation): AuditEntry["decision"] {
  if (observation.status === "failed") return observation.evidence.code !== null && DENIED_CODES.has(observation.evidence.code) ? "deny" : "allow";
  return observation.evidence.masked.length > 0 ? "masked" : "allow";
}

/** One tool call as the audit needs it: who, which tool through which connector, the arguments and which of them to hide, when it started, its call id, the run and initiator it belongs to, and the admin rule that refused it. */
export type AuditedCall = { tool: string; connector: string; userId: string; args: unknown; redact: readonly string[]; startedAt: number; toolCallId: string; runId: string | null; initiator: Initiator; rule?: RuleRef };

function hidden(value: unknown, redact: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) return value.map((inner) => hidden(inner, redact));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, redact.has(key) && inner !== null && inner !== "" ? TH.admin.auditTab.redacted : hidden(inner, redact)]));
}

function shortened(value: unknown): unknown {
  if (typeof value === "string") return value.length > ARG_VALUE_MAX_CHARS ? `${value.slice(0, ARG_VALUE_MAX_CHARS)}…` : value;
  if (Array.isArray(value)) return value.map(shortened);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, shortened(inner)]));
  return value;
}

/** The arguments as the admin reads them in the audit: the tool's personal fields hidden, long text cut short, the whole capped. */
export function argsPreview(args: unknown, redact: readonly string[] = []): string {
  try {
    return JSON.stringify(shortened(hidden(args ?? null, new Set(redact)))).slice(0, ARGS_MAX_CHARS);
  } catch {
    return "";
  }
}

/** Writes the one `AuditEntry` a tool call leaves, from what the harness observed: who, which tool through which connector, hashed args, decision, rows, latency. */
export function recordToolCall(call: AuditedCall, observation: Observation): void {
  const { tool, connector, userId, args, redact, startedAt, toolCallId, runId, initiator, rule } = call;
  const turn = currentTurn();
  const turnId = runId ?? turn.turnId;
  const { code, reason, rows } = observation.evidence;
  auditLog().put({
    id: randomUUID(),
    at: new Date().toISOString(),
    userId,
    tool,
    connector,
    argsHash: argsHash(args),
    decision: decisionOf(observation),
    rowsReturned: rows,
    latencyMs: Date.now() - startedAt,
    ...(code ? { code } : {}),
    ...(reason ? { reason } : {}),
    args: argsPreview(args, redact),
    toolCallId,
    initiator,
    ...(turnId ? { turnId } : {}),
    ...(turn.threadId ? { threadId: turn.threadId } : {}),
    ...(turn.question ? { question: turn.question } : {}),
    ...(rule ? { rule } : {}),
  });
}

/** The name a composed card goes by in the audit, beside the tool calls whose results it shows. */
export const COMPOSED_CARD_AUDIT_TOOL = "composed_card";

const COMPOSED_CARD_CONNECTOR = "winyu";

/** One composed card as the audit needs it: who, in which run and thread, which card, and how many of its lines held. */
export type AuditedCard = { userId: string; runId: string; threadId: string | null; question: string | null; surfaceId: string; accepted: number; rejected: number; problems: readonly string[] };

/** Writes the audit row a composed card leaves, read like a tool call's: allowed when any line held, its dropped lines' reasons, and the number of lines it drew. */
export function recordComposedCard(card: AuditedCard): void {
  const counts = { accepted: card.accepted, rejected: card.rejected };
  auditLog().put({
    id: randomUUID(),
    at: new Date().toISOString(),
    userId: card.userId,
    tool: COMPOSED_CARD_AUDIT_TOOL,
    connector: COMPOSED_CARD_CONNECTOR,
    argsHash: argsHash(counts),
    decision: card.accepted > 0 ? "allow" : "deny",
    rowsReturned: card.accepted,
    latencyMs: 0,
    ...(card.problems.length > 0 ? { reason: argsPreview(card.problems) } : {}),
    args: argsPreview(counts),
    toolCallId: card.surfaceId,
    initiator: "person",
    turnId: card.runId,
    ...(card.threadId ? { threadId: card.threadId } : {}),
    ...(card.question ? { question: card.question } : {}),
  });
}
