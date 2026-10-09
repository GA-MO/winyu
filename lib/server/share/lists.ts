import { isLiveGrant } from "@/lib/access/enforce";
import type { User } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import type { GivenGrant, ReceivedShare, SentShare } from "@/lib/share/card";
import { sliceLabel, untilLabel } from "@/lib/share/grant-label";
import { grants, shareScopeFor } from "@/lib/server/grants";
import { notificationsIn } from "@/lib/server/notify";
import { openersOf, receiptsOf, sharePath, shares, type Share } from "./shares";

function newestFirst(left: Share, right: Share): number {
  return right.at.localeCompare(left.at);
}

function nameOf(userId: string): string {
  return findUser(userId)?.nameTh ?? userId;
}

function givenOn(share: Share, sender: User, at: Date): GivenGrant[] {
  return grants()
    .where((grant) => grant.shareCode === share.id && grant.grantorId === sender.id && isLiveGrant(grant, at))
    .sort((left, right) => left.expiresAt.localeCompare(right.expiresAt))
    .map((grant) => ({ id: grant.id, recipientName: nameOf(grant.recipientId), slice: sliceLabel(grant.slice), until: untilLabel(grant.expiresAt) }));
}

/** The shares one person sent, newest first, each with its recipients and channels, views, and the grants still live on it. */
export function sentShares(sender: User, at = new Date()): SentShare[] {
  return shares()
    .where((share) => share.senderId === sender.id)
    .sort(newestFirst)
    .map((share) => ({ code: share.id, path: sharePath(share.id), title: share.title, at: share.at, receipts: receiptsOf(share), opened: openersOf(share).length, recipients: share.deliveries.length, grants: givenOn(share, sender, at) }));
}

function unreadCodes(viewerId: string): Set<string> {
  return new Set(notificationsIn(viewerId, "shared").filter((item) => !item.read).map((item) => item.refId));
}

/** The shares sent to one person, newest first: sender, note, what the card hides from them by name only, their request or grant, and whether a notification about it is unread. */
export function receivedShares(viewer: User, at = new Date()): ReceivedShare[] {
  const unread = unreadCodes(viewer.id);
  return shares()
    .where((share) => share.senderId !== viewer.id && share.deliveries.some((delivery) => delivery.userId === viewer.id))
    .sort(newestFirst)
    .map((share) => {
      const scope = shareScopeFor(share, viewer, at);
      return {
        code: share.id,
        path: sharePath(share.id),
        title: share.title,
        at: share.at,
        senderName: nameOf(share.senderId),
        note: share.note,
        hidden: scope ? sliceLabel(scope.hidden) : null,
        request: scope?.pendingRequest ? { approverName: scope.pendingRequest.approverName } : null,
        grant: scope?.grant ? { grantorName: scope.grant.grantorName, until: untilLabel(scope.grant.expiresAt) } : null,
        unread: unread.has(share.id),
      };
    });
}
