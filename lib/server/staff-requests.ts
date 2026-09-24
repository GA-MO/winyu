import { randomUUID } from "node:crypto";
import type { AccessContext, User } from "@/lib/contracts";
import { employeeById, managersOf } from "@/lib/data/entities/people";
import { findUser } from "@/lib/data/entities/users";
import { staffRequests, type StaffRequest } from "./agent/collections";
import { createPacket } from "./handoff";

const HR_FALLBACK_USER = "u_may";

/** The login user who approves the viewer's leave and training: the nearest manager with an Inbox, else HR. */
export function approverOf(userId: string): User | null {
  const self = employeeById(userId);
  const managers = self ? managersOf(self) : [];
  const withInbox = managers.map((manager) => (manager.userId ? findUser(manager.userId) : null)).find((user) => user !== null);
  if (withInbox) return withInbox;
  return userId === HR_FALLBACK_USER ? null : findUser(HR_FALLBACK_USER);
}

export function requestsOf(userId: string, kind: StaffRequest["kind"]): StaffRequest[] {
  return staffRequests().all().filter((request) => request.userId === userId && request.kind === kind);
}

/** Leave and training requests stay answerable when the handoff switch is off: they are HR paperwork, not agent handoffs. */
export function isStaffRequestPacket(packetId: string): boolean {
  return staffRequests().all().some((request) => request.packetId === packetId);
}

export type SubmitInput = Omit<StaffRequest, "id" | "userId" | "packetId" | "at"> & { title: string; ask: string; replies: string[]; threadId: string | null };

/** Records the request and puts it in the approver's Inbox as a packet they can accept or send back. */
export function submitRequest(access: AccessContext, approver: User, input: SubmitInput): StaffRequest {
  const packet = createPacket(
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
