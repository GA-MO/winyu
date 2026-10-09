import { isLiveGrant } from "@/lib/access/enforce";
import type { Grant, GrantRequest, User } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import type { GivenGrant, ReceivedLine, ReceivedState, SentLine, SentState, SharePerson } from "@/lib/share/card";
import { sliceLabel, untilLabel } from "@/lib/share/grant-label";
import { grantRequests, grants, shareScopeFor } from "@/lib/server/grants";
import { notificationsIn, notificationsOf } from "@/lib/server/notify";
import { personaOf } from "@/lib/server/portraits";
import { openersOf, sharePath, shares, type Share } from "./shares";

function nameOf(userId: string): string {
  return findUser(userId)?.nameTh ?? userId;
}

function personOf(userId: string): SharePerson {
  const user = findUser(userId);
  return user ? { id: user.id, name: user.nameTh, photo: personaOf(user).photo } : { id: userId, name: userId, photo: null };
}

function latestOf(moments: readonly (string | null)[]): string {
  return moments.filter((moment): moment is string => moment !== null).reduce((left, right) => (right > left ? right : left));
}

function requestMoments(requests: readonly GrantRequest[]): (string | null)[] {
  return requests.flatMap((request) => [request.createdAt, request.decidedAt]);
}

function byActivity(left: { activityAt: string }, right: { activityAt: string }): number {
  return right.activityAt.localeCompare(left.activityAt);
}

function givenOn(shareGrants: readonly Grant[], sender: User, at: Date): GivenGrant[] {
  return shareGrants
    .filter((grant) => grant.grantorId === sender.id && isLiveGrant(grant, at))
    .sort((left, right) => left.expiresAt.localeCompare(right.expiresAt))
    .map((grant) => ({ id: grant.id, recipientName: nameOf(grant.recipientId), slice: sliceLabel(grant.slice), until: untilLabel(grant.expiresAt) }));
}

function sentStateOf(share: Share, pending: readonly GrantRequest[]): SentState {
  const [latest] = [...pending].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  if (latest) return { kind: "asked", requesterName: nameOf(latest.requesterId) };
  return { kind: "delivered", opened: openersOf(share).length, recipients: share.deliveries.length };
}

function unreadRequestIds(viewerId: string): Set<string> {
  return new Set(notificationsOf(viewerId).filter((item) => item.kind === "grant_request" && !item.read).map((item) => item.refId));
}

/** The shares one person sent, latest activity first: recipients, whether someone is asking for more, how many opened it, the grants still live on it, and when it last moved (a request, grant, decision or opening). */
export function sentShares(sender: User, at = new Date()): SentLine[] {
  const unread = unreadRequestIds(sender.id);
  const allRequests = grantRequests().all();
  const allGrants = grants().all();
  return shares()
    .where((share) => share.senderId === sender.id)
    .map((share) => {
      const requests = allRequests.filter((request) => request.shareCode === share.id);
      const shareGrants = allGrants.filter((grant) => grant.shareCode === share.id);
      const pending = requests.filter((request) => request.status === "pending");
      return {
        code: share.id,
        path: sharePath(share.id),
        title: share.title,
        people: share.deliveries.map((delivery) => personOf(delivery.userId)),
        sentAt: share.at,
        activityAt: latestOf([share.at, share.lastViewedAt, ...requestMoments(requests), ...shareGrants.map((grant) => grant.createdAt)]),
        state: sentStateOf(share, pending),
        unread: pending.some((request) => unread.has(request.id)),
        grants: givenOn(shareGrants, sender, at),
      };
    })
    .sort(byActivity);
}

function receivedStateOf(share: Share, viewer: User, requests: readonly GrantRequest[], at: Date): ReceivedState {
  const scope = shareScopeFor(share, viewer, at);
  if (!scope) return { kind: "full" };
  if (scope.grant) return { kind: "granted", until: untilLabel(scope.grant.expiresAt) };
  if (scope.pendingRequest) return { kind: "pending", approverName: scope.pendingRequest.approverName };
  const [latest] = [...requests].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  if (latest?.status === "declined") return { kind: "declined" };
  return { kind: "hidden", slice: sliceLabel(scope.hidden) };
}

function unreadShareCodes(viewerId: string): Set<string> {
  return new Set(notificationsIn(viewerId, "shared").filter((item) => !item.read).map((item) => item.refId));
}

/** The shares sent to one person, latest activity first: the sender, where the person stands (a live grant, a pending or declined request, a part hidden by name, or nothing hidden), when it last moved, and whether a notification about it is unread. */
export function receivedShares(viewer: User, at = new Date()): ReceivedLine[] {
  const unread = unreadShareCodes(viewer.id);
  const ownRequests = grantRequests().where((request) => request.requesterId === viewer.id);
  const ownGrants = grants().where((grant) => grant.recipientId === viewer.id);
  return shares()
    .where((share) => share.senderId !== viewer.id && share.deliveries.some((delivery) => delivery.userId === viewer.id))
    .map((share) => {
      const requests = ownRequests.filter((request) => request.shareCode === share.id);
      const shareGrants = ownGrants.filter((grant) => grant.shareCode === share.id);
      return {
        code: share.id,
        path: sharePath(share.id),
        title: share.title,
        people: [personOf(share.senderId)],
        sentAt: share.at,
        activityAt: latestOf([share.at, ...requestMoments(requests), ...shareGrants.map((grant) => grant.createdAt)]),
        state: receivedStateOf(share, viewer, requests, at),
        unread: unread.has(share.id),
        grants: [],
      };
    })
    .sort(byActivity);
}
