import type { AccessContext, User } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { requestLinks, type RequestLink } from "./agent/collections";
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

/** Leave and training requests stay answerable when the handoff switch is off: they are HR paperwork, not agent handoffs. */
export function isStaffRequestPacket(packetId: string): boolean {
  return requestLinks().get(packetId) !== null;
}

/** How the approver is told about a request filed in another system: the packet's title, the ask, the suggested replies and the conversation it came from. */
export type ApproverNote = { title: string; ask: string; replies: string[]; threadId: string | null };

/** A request held by another system, by which system and its id there. */
export type HeldRequest = Pick<RequestLink, "system" | "requestId" | "employeeId">;

/** Puts a request the leave system or the LMS now holds in the approver's Inbox, linked so their decision goes back to that system; a request already delivered is not delivered twice. */
export async function deliverRequest(access: AccessContext, approver: User, request: HeldRequest, note: ApproverNote): Promise<void> {
  if (requestLinks().where((link) => link.system === request.system && link.requestId === request.requestId).length > 0) return;
  const packet = await createPacket(
    { toUserId: approver.id, title: note.title, ask: note.ask, urgency: "low", evidence: [], alertIds: [], digest: note.ask, suggestedActions: note.replies, threadId: note.threadId },
    findUser(access.userId),
    approver,
  );
  requestLinks().put({ id: packet.id, ...request, approverId: approver.id });
}

const DECISIONS: Partial<Record<PacketAction, boolean>> = { accept: true, resolve: true, return: false };

/** Sends the approver's answer in the Inbox to the system that holds the request: accept or close approves it, return sends it back, asking for more changes nothing. */
export async function forwardDecision(packetId: string, approverId: string, action: PacketAction): Promise<void> {
  const link = requestLinks().get(packetId);
  const approved = DECISIONS[action];
  if (!link || approved === undefined || link.approverId !== approverId) return;
  if (link.system === "leave") await ports().leave.decide(link.requestId, approverId, approved);
  else await ports().learning.decide(link.requestId, approverId, approved);
}
