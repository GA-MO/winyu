import { randomUUID } from "node:crypto";
import type { AccessContext, LeaveRequest, User } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { requestLinks, staffRequests, type StaffRequest } from "./agent/collections";
import { createPacket, type PacketAction } from "./handoff";
import { ports } from "./ports";
import { directoryOf } from "./ports/directory";

const HR_FALLBACK_USER = "u_may";

/** The login user who approves the viewer's leave and training: the nearest manager with an Inbox, else HR. */
export async function approverOf(userId: string): Promise<User | null> {
  const directory = directoryOf(await ports().directory.load());
  const self = directory.byId(userId);
  const managers = self ? directory.managersOf(self) : [];
  const withInbox = managers.map((manager) => (manager.userId ? findUser(manager.userId) : null)).find((user) => user !== null);
  if (withInbox) return withInbox;
  return userId === HR_FALLBACK_USER ? null : findUser(HR_FALLBACK_USER);
}

export function requestsOf(userId: string, kind: StaffRequest["kind"]): StaffRequest[] {
  return staffRequests().all().filter((request) => request.userId === userId && request.kind === kind);
}

/** Leave and training requests stay answerable when the handoff switch is off: they are HR paperwork, not agent handoffs. */
export function isStaffRequestPacket(packetId: string): boolean {
  return requestLinks().get(packetId) !== null || staffRequests().all().some((request) => request.packetId === packetId);
}

/** How the approver is told about a request filed in another system: the packet's title, the ask, the suggested replies and the conversation it came from. */
export type ApproverNote = { title: string; ask: string; replies: string[]; threadId: string | null };

async function notifyApprover(access: AccessContext, approver: User, note: ApproverNote) {
  return createPacket(
    { toUserId: approver.id, title: note.title, ask: note.ask, urgency: "low", evidence: [], alertIds: [], digest: note.ask, suggestedActions: note.replies, threadId: note.threadId },
    findUser(access.userId),
    approver,
  );
}

/** Puts a leave request the leave system now holds in the approver's Inbox, linked so their decision goes back to the leave system. */
export async function deliverLeaveRequest(access: AccessContext, approver: User, request: LeaveRequest, note: ApproverNote): Promise<void> {
  if (requestLinks().where((link) => link.system === "leave" && link.requestId === request.id).length > 0) return;
  const packet = await notifyApprover(access, approver, note);
  requestLinks().put({ id: packet.id, system: "leave", requestId: request.id, employeeId: request.employeeId, approverId: approver.id });
}

const DECISIONS: Partial<Record<PacketAction, boolean>> = { accept: true, resolve: true, return: false };

/** Sends the approver's answer in the Inbox to the system that holds the request: accept or close approves it, return sends it back, asking for more changes nothing. */
export async function forwardDecision(packetId: string, approverId: string, action: PacketAction): Promise<void> {
  const link = requestLinks().get(packetId);
  const approved = DECISIONS[action];
  if (!link || approved === undefined || link.approverId !== approverId) return;
  await ports().leave.decide(link.requestId, approverId, approved);
}

export type SubmitInput = Omit<StaffRequest, "id" | "userId" | "packetId" | "at"> & { title: string; ask: string; replies: string[]; threadId: string | null };

/** Records the request and puts it in the approver's Inbox as a packet they can accept or send back. */
export async function submitRequest(access: AccessContext, approver: User, input: SubmitInput): Promise<StaffRequest> {
  const packet = await createPacket(
    { toUserId: approver.id, title: input.title, ask: input.ask, urgency: "low", evidence: [], alertIds: [], digest: input.ask, suggestedActions: input.replies, threadId: input.threadId },
    findUser(access.userId),
    approver,
  );
  return staffRequests().put({
    id: randomUUID(),
    userId: access.userId,
    kind: input.kind,
    refId: input.refId,
    from: input.from,
    to: input.to,
    days: input.days,
    reason: input.reason,
    packetId: packet.id,
    at: new Date().toISOString(),
  });
}
