import { collection } from "@/lib/server/store/json-store";

export const APPROVALS_COLLECTION = "approvals";

const MAX_KEPT_APPROVALS = 1000;

/** One approval the server asked a person for: whose it is, which call it covers, and whether an answer already spent it. */
export type ApprovalRecord = { id: string; userId: string; toolCallId: string; tool: string; status: "asked" | "answered"; at: string };

export type ApprovalProblem = "unknown" | "other_user" | "already_answered" | "other_call";

function approvals() {
  return collection<ApprovalRecord>(APPROVALS_COLLECTION);
}

function prune(): void {
  const store = approvals();
  const kept = store.all();
  const excess = kept.length - MAX_KEPT_APPROVALS;
  if (excess <= 0) return;
  for (const record of [...kept].sort((left, right) => left.at.localeCompare(right.at)).slice(0, excess)) store.remove(record.id);
}

/** Remembers an approval the reply asked this person for, so only their one answer can spend it. */
export function recordAsked(approvalId: string, userId: string, toolCallId: string, tool: string): void {
  approvals().put({ id: approvalId, userId, toolCallId, tool, status: "asked", at: new Date().toISOString() });
  prune();
}

/** Why an answer may not be used, or null when it answers an open approval this person was asked for this very call. */
export function problemOf(approvalId: string, userId: string, toolCallId: string): ApprovalProblem | null {
  const record = approvals().get(approvalId);
  if (!record) return "unknown";
  if (record.userId !== userId) return "other_user";
  if (record.toolCallId !== toolCallId) return "other_call";
  return record.status === "answered" ? "already_answered" : null;
}

/** Spends an approval: the signed answer can never run its tool a second time. */
export function markAnswered(approvalId: string): void {
  const record = approvals().get(approvalId);
  if (record) approvals().put({ ...record, status: "answered", at: new Date().toISOString() });
}

/** The tool an approval was asked for, or null for an id the server never asked. */
export function askedTool(approvalId: string): string | null {
  return approvals().get(approvalId)?.tool ?? null;
}

/** The approvals still waiting on this person's answer for any of these tool calls, so a reloaded chat can ask again. */
export function openApprovalsFor(userId: string, toolCallIds: readonly string[]): ApprovalRecord[] {
  const wanted = new Set(toolCallIds);
  return approvals().where((record) => record.userId === userId && record.status === "asked" && wanted.has(record.toolCallId));
}
