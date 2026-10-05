import { randomBytes } from "node:crypto";
import { describeToolCall } from "@/lib/cards/describe-call";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { collection } from "@/lib/server/store/json-store";
import type { ChannelMessage, TurnAsked } from "./turn";
import type { ApprovalPrompt, Channel } from "./types";

const PENDING_COLLECTION = "channel-approvals";
const ID_BYTES = 12;

/** An approval a chat app shows as buttons: the short id the buttons carry (LINE postback data holds 300 characters), and what answering it re-sends to the ledger. The ledger, not this record, decides whether an answer counts. */
export type PendingApproval = { id: string; channel: Channel; userId: string; threadId: string; message: ChannelMessage; interruptId: string; tool: string; args: unknown; createdAt: string };

const pending = () => collection<PendingApproval>(PENDING_COLLECTION);

function recipientName(args: unknown): string {
  const toUserId = typeof args === "object" && args !== null ? (args as { toUserId?: unknown }).toUserId : undefined;
  return typeof toUserId === "string" ? (findUser(toUserId)?.nameTh ?? toUserId) : "";
}

const EFFECTS: Record<string, (args: unknown) => string> = {
  create_handoff: (args) => TH.approve.effectHandoff(recipientName(args)),
  send_email: (args) => TH.approve.effectEmail(recipientName(args)),
  pin_widget: () => TH.approve.effectPin,
  watch_metric: () => TH.approve.effectWatch,
  run_job: () => TH.approve.effectJob,
  request_leave: () => TH.approve.effectLeave,
  enroll_course: () => TH.approve.effectEnroll,
  set_permission: () => TH.approve.effectPermission,
};

/** Keeps the approval a turn stopped at so the person can answer it from the chat app. */
export function holdApproval(channel: Channel, userId: string, threadId: string, message: ChannelMessage, asked: TurnAsked, args: unknown): PendingApproval {
  const id = randomBytes(ID_BYTES).toString("base64url");
  return pending().put({ id, channel, userId, threadId, message, interruptId: asked.interruptId, tool: asked.tool, args, createdAt: new Date().toISOString() });
}

export function heldApproval(id: string): PendingApproval | null {
  return pending().get(id);
}

/** What the person is asked to approve, in the words the web approval card uses. */
export function promptOf(approval: PendingApproval): ApprovalPrompt {
  const described = describeToolCall(approval.tool, approval.args);
  return { id: approval.id, question: described?.question ?? TH.channels.approvalAlt, effect: EFFECTS[approval.tool]?.(approval.args) ?? null };
}
