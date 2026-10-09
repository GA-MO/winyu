import { createHash, randomUUID } from "node:crypto";
import type { AuditEntry, GrantSlice, Initiator, RuleRef } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import type { GuardFinding } from "@/lib/harness/guard";
import { THROWN_CODE } from "@/lib/harness/observation";
import { currentRun, emit } from "@/lib/harness/runtime";
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

/** A tool's arguments with its personal fields replaced by the redaction mark, at any depth. */
export function withoutPersonalFields(value: unknown, redact: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) return value.map((inner) => withoutPersonalFields(inner, redact));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, redact.has(key) && inner !== null && inner !== "" ? TH.admin.auditTab.redacted : withoutPersonalFields(inner, redact)]));
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
    return JSON.stringify(shortened(withoutPersonalFields(args ?? null, new Set(redact)))).slice(0, ARGS_MAX_CHARS);
  } catch {
    return "";
  }
}

/** Writes the one `AuditEntry` a tool call leaves, from what the harness observed: who, which tool through which connector, hashed args, decision, rows, latency. */
export function recordToolCall(call: AuditedCall, observation: Observation): void {
  const { tool, connector, userId, args, redact, startedAt, toolCallId, runId, initiator, rule } = call;
  const turn = currentTurn();
  const turnId = runId ?? turn.turnId;
  const { code, reason, rows, grant } = observation.evidence;
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
    ...(grant ? { grant } : {}),
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

/** The name a shared card goes by in the audit, beside the tool calls a recipient's opening re-runs. */
export const SHARE_AUDIT_TOOL = "share";

const SHARE_CONNECTOR = "winyu";

/** One share as the audit needs it: who sent which card (its code, title and the tools behind it) to whom on which channel; never a value from the card nor the sender's note. */
export type AuditedShare = { userId: string; code: string; title: string; reads: readonly string[]; deliveries: ReadonlyArray<{ userId: string; asked: string; via: string; fallback: string | null }> };

/** Writes the audit row a share leaves, read like a tool call the person made: the recipients and channels as its arguments, one row per recipient as its rows. */
export function recordShare(share: AuditedShare): void {
  const args = { code: share.code, title: share.title, reads: share.reads, to: share.deliveries.map((delivery) => `${delivery.userId}:${delivery.via}`) };
  const fallbacks = share.deliveries.filter((delivery) => delivery.fallback !== null);
  auditLog().put({
    id: randomUUID(),
    at: new Date().toISOString(),
    userId: share.userId,
    tool: SHARE_AUDIT_TOOL,
    connector: SHARE_CONNECTOR,
    argsHash: argsHash(args),
    decision: "allow",
    rowsReturned: share.deliveries.length,
    latencyMs: 0,
    reason: TH.share.auditReason([...new Set(share.deliveries.map((delivery) => TH.share.channel[delivery.via] ?? delivery.via))].join(", ")) + (fallbacks.length > 0 ? ` · ${fallbacks.map((delivery) => TH.share.auditFallback(delivery.userId, TH.share.channel[delivery.asked] ?? delivery.asked)).join(", ")}` : ""),
    args: argsPreview(args),
    toolCallId: share.code,
    initiator: "person",
  });
}

/** The name a guard decision goes by in the audit, beside the tool calls of the same run. */
export const GUARD_AUDIT_TOOL = "guardrail";

const GUARD_CONNECTOR = "winyu";

/** Records one guard decision: an event on the current run's trace and an audit row naming its source, check, kinds and action, never the text it guarded. */
export function recordGuardFinding(finding: GuardFinding, userId: string): void {
  emit("runtime", { type: "guard.flagged", payload: finding });
  const run = currentRun();
  const turn = currentTurn();
  const turnId = run?.id ?? turn.turnId;
  const kinds = finding.kinds.map((kind) => TH.guard.kind[kind] ?? kind).join(", ");
  auditLog().put({
    id: randomUUID(),
    at: new Date().toISOString(),
    userId,
    tool: GUARD_AUDIT_TOOL,
    connector: GUARD_CONNECTOR,
    argsHash: argsHash(finding),
    decision: finding.action === "warned" ? "allow" : "masked",
    rowsReturned: 0,
    latencyMs: 0,
    reason: `${TH.guard.flagged(finding.check, TH.guard.source[finding.source] ?? finding.source)}: ${kinds} · ${TH.guard.action[finding.action] ?? finding.action}`,
    args: argsPreview(finding),
    toolCallId: randomUUID(),
    initiator: run?.initiator ?? "person",
    ...(turnId ? { turnId } : {}),
    ...(turn.threadId ? { threadId: turn.threadId } : {}),
    ...(turn.question ? { question: turn.question } : {}),
  });
}

/** The name an IT admin's work on a console connector goes by in the audit. */
export const CONNECTOR_ADMIN_AUDIT_TOOL = "connector_admin";

/** What an IT admin did to a connector made in the console, or tried to and was refused. */
export type ConnectorEventKind = "created" | "rediscovered" | "tool_saved" | "upstream_approved" | "tool_removed" | "sampled" | "tested" | "activated" | "enabled" | "disabled" | "secret_rotated" | "upstream_checked" | "model_checked" | "refused";

/** One connector event as the audit needs it: who, which connector and tool, what happened in Thai, and names and counts only; never a secret nor a row value. */
export type AuditedConnectorEvent = { userId: string; event: ConnectorEventKind; connector: string; tool: string | null; reason: string; detail: Record<string, unknown>; code?: string };

/** Writes the audit row one connector event leaves: a refusal is a deny, every other event an allow. */
export function recordConnectorEvent(entry: AuditedConnectorEvent): void {
  const args = { event: entry.event, ...(entry.tool ? { tool: entry.tool } : {}), ...entry.detail };
  auditLog().put({
    id: randomUUID(),
    at: new Date().toISOString(),
    userId: entry.userId,
    tool: CONNECTOR_ADMIN_AUDIT_TOOL,
    connector: entry.connector,
    argsHash: argsHash(args),
    decision: entry.event === "refused" ? "deny" : "allow",
    rowsReturned: 0,
    latencyMs: 0,
    ...(entry.code ? { code: entry.code } : {}),
    reason: entry.reason,
    args: argsPreview(args),
    toolCallId: randomUUID(),
    initiator: "person",
  });
}

/** The name a temporary grant's lifecycle goes by in the audit. */
export const GRANT_AUDIT_TOOL = "grant";

const GRANT_CONNECTOR = "winyu";

/** What happened to a grant or a request for one. */
export type GrantEventKind = "requested" | "granted" | "declined" | "revoked" | "refused";

/** One grant event as the audit needs it: who acted, on which grant or request, which slice for whom, and in Thai what happened; a refusal carries its code. */
export type AuditedGrantEvent = { userId: string; event: GrantEventKind; ref: string; slice: GrantSlice; recipientId: string; days: number | null; reason: string; code?: string };

/** Writes the audit row one grant event leaves: a refusal or a declined request is a deny, every other event an allow. */
export function recordGrantEvent(entry: AuditedGrantEvent): void {
  const args = { event: entry.event, ref: entry.ref, metric: entry.slice.metric, regions: entry.slice.regions, brands: entry.slice.brands, recipient: entry.recipientId, days: entry.days };
  auditLog().put({
    id: randomUUID(),
    at: new Date().toISOString(),
    userId: entry.userId,
    tool: GRANT_AUDIT_TOOL,
    connector: GRANT_CONNECTOR,
    argsHash: argsHash(args),
    decision: entry.event === "refused" || entry.event === "declined" ? "deny" : "allow",
    rowsReturned: 0,
    latencyMs: 0,
    ...(entry.code ? { code: entry.code } : {}),
    reason: entry.reason,
    args: argsPreview(args),
    toolCallId: entry.ref,
    initiator: "person",
  });
}
