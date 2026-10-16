import { randomUUID } from "node:crypto";
import type { AccessContext, User } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { collection } from "@/lib/server/store/json-store";
import { notify } from "./notify";
import { ports } from "./ports";
import { directoryOf } from "./ports/directory";

const HR_FALLBACK_USER = "u_may";
const STAFF_REQUESTS_COLLECTION = "request-links";

export const STAFF_DECISIONS = ["approve", "decline"] as const;

/** What an approver answers on a leave or training request: approve it or turn it down. */
export type StaffDecision = (typeof STAFF_DECISIONS)[number];

/** A leave or training request another system holds (the leave system, the LMS), waiting in the approver's Inbox: who asked, what for, and where it stands. */
export type StaffRequest = {
  id: string;
  system: "leave" | "course";
  requestId: string;
  employeeId: string;
  approverId: string;
  title: string;
  ask: string;
  status: "pending" | "approved" | "declined";
  createdAt: string;
  decidedAt: string | null;
};

type StoredRequest = Partial<StaffRequest> & Pick<StaffRequest, "id" | "system" | "requestId" | "employeeId" | "approverId">;

const STATUS_OF: Record<StaffDecision, StaffRequest["status"]> = { approve: "approved", decline: "declined" };

function readable(stored: StoredRequest): StaffRequest | null {
  if (typeof stored.title !== "string" || typeof stored.ask !== "string" || typeof stored.createdAt !== "string") return null;
  return { ...stored, title: stored.title, ask: stored.ask, createdAt: stored.createdAt, status: stored.status ?? "pending", decidedAt: stored.decidedAt ?? null };
}

/** Every request an approver was told about; a link stored before requests kept their own words is left out. */
export function staffRequests(): StaffRequest[] {
  return collection<StoredRequest>(STAFF_REQUESTS_COLLECTION).all().flatMap((stored) => readable(stored) ?? []);
}

function store(request: StaffRequest): StaffRequest {
  collection<StoredRequest>(STAFF_REQUESTS_COLLECTION).put(request);
  return request;
}

/** The login user who approves the viewer's leave and training: the nearest manager with an Inbox, else HR. */
export async function approverOf(userId: string): Promise<User | null> {
  const directory = directoryOf(await ports().directory.load());
  const self = directory.byId(userId);
  const managers = self ? directory.managersOf(self) : [];
  const withInbox = managers.map((manager) => (manager.userId ? findUser(manager.userId) : null)).find((user) => user !== null);
  if (withInbox) return withInbox;
  return userId === HR_FALLBACK_USER ? null : findUser(HR_FALLBACK_USER);
}

/** How the approver is told about a request filed in another system: its title and the ask in words. */
export type ApproverNote = { title: string; ask: string };

/** A request held by another system, by which system and its id there. */
export type HeldRequest = Pick<StaffRequest, "system" | "requestId" | "employeeId">;

/** Puts a request the leave system or the LMS now holds in the approver's Inbox, so their decision goes back to that system; a request already delivered is not delivered twice. */
export async function deliverRequest(access: AccessContext, approver: User, request: HeldRequest, note: ApproverNote, at = new Date()): Promise<void> {
  if (staffRequests().some((held) => held.system === request.system && held.requestId === request.requestId)) return;
  const stored = store({ id: randomUUID(), ...request, approverId: approver.id, title: note.title, ask: note.ask, status: "pending", createdAt: at.toISOString(), decidedAt: null });
  notify(approver.id, access.userId, { kind: "staff_request", refId: stored.id, requesterName: findUser(access.userId)?.nameTh ?? access.userId, title: note.title }, at);
}

/** The requests still waiting on this approver, oldest first. */
export function pendingStaffRequestsFor(approverId: string): StaffRequest[] {
  return staffRequests()
    .filter((request) => request.approverId === approverId && request.status === "pending")
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

/** What deciding a request did: the stored request, or why nothing changed. */
export type StaffDecided = { ok: true; request: StaffRequest } | { ok: false; reason: "not_found" | "decided" };

/** The approver's answer: sent to the system that holds the request, kept on the request, and told to the person who asked, once. */
export async function decideStaffRequest(id: string, approver: User, decision: StaffDecision, at = new Date()): Promise<StaffDecided> {
  const request = staffRequests().find((held) => held.id === id && held.approverId === approver.id);
  if (!request) return { ok: false, reason: "not_found" };
  if (request.status !== "pending") return { ok: false, reason: "decided" };
  const approved = decision === "approve";
  if (request.system === "leave") await ports().leave.decide(request.requestId, approver.id, approved);
  else await ports().learning.decide(request.requestId, approver.id, approved);
  const decided = store({ ...request, status: STATUS_OF[decision], decidedAt: at.toISOString() });
  notify(request.employeeId, approver.id, { kind: "staff_decision", refId: decided.id, approverName: approver.nameTh, title: decided.title, approved }, at);
  return { ok: true, request: decided };
}
