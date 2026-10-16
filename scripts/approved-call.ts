import { randomUUID } from "node:crypto";
import { markAnswered, recordAsked } from "@/lib/harness/approvals";

/** A tool call id this person has said yes to, as the chat's approval card leaves it in the ledger, so a test can run a write through the gateway the way an approved call reaches it; each call records one more yes for the id. */
export function approvedCallId(userId: string, tool: string, toolCallId: string = randomUUID()): string {
  const approvalId = `test-approval::${randomUUID()}::${toolCallId}`;
  recordAsked(approvalId, userId, toolCallId, tool);
  markAnswered(approvalId, true);
  return toolCallId;
}
