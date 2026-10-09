import type { ContextPacket, GrantRequest, Notification } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { bucketOf, type BellDecision, type BellItem, type BellPayload, type BellPerson } from "@/components/notifications/items";
import { sliceLabel } from "@/lib/share/grant-label";
import { notificationTarget, notificationTitle } from "@/lib/share/notification-kinds";
import { newHandoffsFor, pendingRequestsFor } from "@/lib/server/inbox";
import { notificationsOf } from "@/lib/server/notify";
import { personaOf } from "@/lib/server/portraits";

const BELL_UPDATES = 8;
const ACTIVITY_UPDATES = 40;

function personOf(userId: string | undefined): BellPerson | null {
  const user = userId ? findUser(userId) : undefined;
  if (!user) return null;
  const persona = personaOf(user);
  return { name: persona.nameTh, photo: persona.photo };
}

function decisionKey(kind: BellDecision["kind"], refId: string): string {
  return `${kind}:${refId}`;
}

function requestItem(request: GrantRequest, told: Map<string, Notification>): BellDecision {
  const key = decisionKey("grant_request", request.id);
  const person = personOf(request.requesterId);
  const title = notificationTitle({ kind: "grant_request", refId: request.id, requesterName: person?.name ?? request.requesterId, slice: sliceLabel(request.slice) });
  const note = told.get(key);
  return { key, kind: "grant_request", refId: request.id, title, person, at: request.createdAt, read: note?.read ?? false, target: notificationTarget({ kind: "grant_request", refId: request.id }), notificationId: note?.id ?? null };
}

function handoffItem(packet: ContextPacket, told: Map<string, Notification>): BellDecision {
  const key = decisionKey("handoff", packet.id);
  const person = personOf(packet.fromUserId);
  const note = told.get(key);
  return {
    key,
    kind: "handoff",
    refId: packet.id,
    title: TH.handoff.newFrom(person?.name ?? packet.fromUserId, packet.title),
    person,
    at: packet.createdAt,
    read: note?.read ?? false,
    target: notificationTarget({ kind: "handoff", refId: packet.id }),
    notificationId: note?.id ?? null,
  };
}

function updateItem(note: Notification): BellItem {
  return { key: note.id, kind: note.kind, refId: note.refId, title: note.title, person: personOf(note.fromUserId), at: note.at, read: note.read, target: notificationTarget(note), notificationId: note.id };
}

/** The decisions waiting on the person, built from the open records the bell counts, each read when its notification was. */
export function decisionsFor(userId: string, notes: readonly Notification[] = notificationsOf(userId)): BellDecision[] {
  const told = new Map(notes.filter((note) => bucketOf(note.kind) === "decide").map((note) => [`${note.kind}:${note.refId}`, note]));
  const items = [...pendingRequestsFor(userId).map((request) => requestItem(request, told)), ...newHandoffsFor(userId).map((packet) => handoffItem(packet, told))];
  return items.sort((left, right) => right.at.localeCompare(left.at));
}

/** The person's latest updates, newest first: everything they were told that waits on nothing. */
export function updatesFor(userId: string, limit = ACTIVITY_UPDATES, notes: readonly Notification[] = notificationsOf(userId)): BellItem[] {
  return notes.filter((note) => bucketOf(note.kind) === "update").slice(0, limit).map(updateItem);
}

/** What the bell opens on. */
export function bellFor(userId: string): BellPayload {
  const notes = notificationsOf(userId);
  return { decide: decisionsFor(userId, notes), updates: updatesFor(userId, BELL_UPDATES, notes) };
}
