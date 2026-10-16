import { collection } from "@/lib/server/store/json-store";

export const APPROVALS_COLLECTION = "approvals";

const MAX_KEPT_APPROVALS = 1000;

/** Where one approval stands: asked and waiting, answered yes (the call may act once), answered no, or its yes already carried the call out. */
export type ApprovalStatus = "asked" | "approved" | "declined" | "spent";

/** One approval the server asked a person for: whose it is, which call it covers, the message it was asked under, and what became of it. */
export type ApprovalRecord = { id: string; userId: string; toolCallId: string; tool: string; messageId?: string | null; status: ApprovalStatus; at: string };

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
export function recordAsked(approvalId: string, userId: string, toolCallId: string, tool: string, messageId: string | null = null): void {
  approvals().put({ id: approvalId, userId, toolCallId, tool, messageId, status: "asked", at: new Date().toISOString() });
  prune();
}

/** The person's message an approval was asked under, or null when the server never asked it or did not keep the message. */
export function askedUnder(approvalId: string): string | null {
  return approvals().get(approvalId)?.messageId ?? null;
}

/** Why an answer may not be used, or null when it answers an open approval this person was asked for this very call. */
export function problemOf(approvalId: string, userId: string, toolCallId: string): ApprovalProblem | null {
  const record = approvals().get(approvalId);
  if (!record) return "unknown";
  if (record.userId !== userId) return "other_user";
  if (record.toolCallId !== toolCallId) return "other_call";
  return record.status === "asked" ? null : "already_answered";
}

/** Records the person's one answer to an approval: the signed answer can never be given again. */
export function markAnswered(approvalId: string, approved: boolean): void {
  const record = approvals().get(approvalId);
  if (record) approvals().put({ ...record, status: approved ? "approved" : "declined", at: new Date().toISOString() });
}

/** Spends this person's yes to this very call of this tool, so the call acts once; false when nobody said yes to it, it was declined, or its yes is already spent. */
export function spendYes(userId: string, toolCallId: string, tool: string): boolean {
  const [record] = approvals().where((entry) => entry.userId === userId && entry.toolCallId === toolCallId && entry.tool === tool && entry.status === "approved");
  if (!record) return false;
  approvals().put({ ...record, status: "spent", at: new Date().toISOString() });
  return true;
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
