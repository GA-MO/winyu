import { randomUUID } from "node:crypto";
import { baseAccessFor, GRANTS_COLLECTION, isLiveGrant, liveAccessFor } from "@/lib/access/enforce";
import { DEFAULT_GRANT_AUTHORITY, GRANT_DOMAINS, grantedSlice, grantRefusal, hiddenFrom, type GrantDomain } from "@/lib/access/grants";
import { policyRules } from "@/lib/access/policy-rules";
import { DEFAULT_GRANT_DAYS, type Grant, type GrantDays, type GrantRefusal, type GrantRequest, type GrantSlice, type RoleId, type ShareScope, type User } from "@/lib/contracts";
import { findUser, USERS } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import type { ShareGrantReceipt, SharedCard } from "@/lib/share/card";
import { sliceLabel } from "@/lib/share/grant-label";
import { recordGrantEvent } from "@/lib/server/audit";
import { channelWebOrigin } from "@/lib/server/channels/config";
import { ports } from "@/lib/server/ports";
import { mayOpen, shares, type Share } from "@/lib/server/share/shares";
import { collection } from "@/lib/server/store/json-store";

export const GRANT_REQUESTS_COLLECTION = "grant-requests";
export const GRANT_AUTHORITY_COLLECTION = "grant-authority";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const GRANT_PATH = "/g/";
const REASON_MAX = 300;

/** IT's choice of which domains one role may grant, in place of the default. */
export type GrantAuthorityOverride = { id: RoleId; domains: GrantDomain[]; by: string; at: string };

/** What giving a grant returns: the stored grant, or why it was refused. */
export type GrantOutcome = { ok: true; grant: Grant } | { ok: false; refusal: GrantRefusal };

/** Why a request could not be made. */
export type RequestProblem = "missing" | "not_yours" | "nothing_hidden" | "no_approver";

export type RequestOutcome = { ok: true; request: GrantRequest } | { ok: false; problem: RequestProblem };

/** What deciding a request returns: the request as it now stands, or why it could not be decided. */
export type DecisionOutcome = { ok: true; request: GrantRequest; grant: Grant | null } | { ok: false; problem: "missing" | "not_yours" | "decided" } | { ok: false; problem: "refused"; refusal: GrantRefusal };

export function grants() {
  return collection<Grant>(GRANTS_COLLECTION);
}

export function grantRequests() {
  return collection<GrantRequest>(GRANT_REQUESTS_COLLECTION);
}

function authorityOverrides() {
  return collection<GrantAuthorityOverride>(GRANT_AUTHORITY_COLLECTION);
}

/** The domains a role may grant right now: IT's override, else the default. */
export function grantAuthorityOf(role: RoleId): readonly GrantDomain[] {
  return authorityOverrides().get(role)?.domains ?? DEFAULT_GRANT_AUTHORITY[role] ?? [];
}

/** Sets the domains a role may grant; anything outside the grantable domains is dropped. */
export function setGrantAuthority(role: RoleId, domains: readonly string[], by: string, at = new Date()): GrantAuthorityOverride {
  const kept = GRANT_DOMAINS.filter((domain) => domains.includes(domain));
  return authorityOverrides().put({ id: role, domains: kept, by, at: at.toISOString() });
}

/** Whether a person may grant anything at all, so the share sheet offers the choice only to them. */
export function mayGrant(user: User): boolean {
  return grantAuthorityOf(user.role).length > 0;
}

/** Why the grantor may not open this slice to the recipient now, from the grantor's own access (never their grants) and the recipient's live one. */
export function refusalFor(grantor: User, recipient: User, slice: GrantSlice, days: GrantDays, at: Date): GrantRefusal | null {
  return grantRefusal({ grantor: baseAccessFor(grantor), authority: grantAuthorityOf(grantor.role), recipient: liveAccessFor(recipient, at), slice, days, at, rules: policyRules() });
}

function nameOf(userId: string): string {
  return findUser(userId)?.nameTh ?? userId;
}

function refusalText(refusal: GrantRefusal): string {
  return TH.grant.refusal[refusal.code] ?? refusal.code;
}

type GrantAsk = { grantor: User; recipient: User; slice: GrantSlice; days: GrantDays; shareCode: string | null; requestId: string | null; at: Date };

/** Gives one grant when the rules allow it, and audits the outcome either way. */
export function giveGrant(ask: GrantAsk): GrantOutcome {
  const { grantor, recipient, slice, days, shareCode, requestId, at } = ask;
  const refusal = refusalFor(grantor, recipient, slice, days, at);
  if (refusal) {
    recordGrantEvent({ userId: grantor.id, event: "refused", ref: requestId ?? shareCode ?? randomUUID(), slice, recipientId: recipient.id, days, code: refusal.code, reason: TH.grant.audit.refused(recipient.nameTh, refusalText(refusal)) });
    return { ok: false, refusal };
  }
  const grant = grants().put({
    id: randomUUID(), grantorId: grantor.id, recipientId: recipient.id, slice, days, shareCode, requestId,
    createdAt: at.toISOString(), expiresAt: new Date(at.getTime() + days * MS_PER_DAY).toISOString(), revokedAt: null, revokedBy: null,
  });
  recordGrantEvent({ userId: grantor.id, event: "granted", ref: grant.id, slice, recipientId: recipient.id, days, reason: TH.grant.audit.granted(recipient.nameTh, days) });
  return { ok: true, grant };
}

function slicesOf(card: SharedCard, sender: User, at: Date): GrantSlice[] {
  const access = liveAccessFor(sender, at);
  const seen = new Set<string>();
  return card.reads.flatMap((read) => {
    const slice = grantedSlice(access, read);
    if (!slice || seen.has(slice.metric)) return [];
    seen.add(slice.metric);
    return [slice];
  });
}

/** At share time, grants each recipient every slice the card showed the sender, when the sender may; a refusal never stops the share. */
export function grantOnShare(sender: User, card: SharedCard, recipientIds: readonly string[], days: GrantDays, shareCode: string, at = new Date()): ShareGrantReceipt[] {
  const slices = slicesOf(card, sender, at);
  return recipientIds.flatMap((userId) => {
    const recipient = findUser(userId);
    if (!recipient) return [];
    return slices.map((slice) => {
      const outcome = giveGrant({ grantor: sender, recipient, slice, days, shareCode, requestId: null, at });
      return { userId, name: recipient.nameTh, metric: slice.metric, granted: outcome.ok, refusal: outcome.ok ? null : outcome.refusal.code };
    });
  });
}

function hiddenSliceOf(share: Share, viewer: User, at: Date): GrantSlice | null {
  const sender = findUser(share.senderId);
  if (!sender || sender.id === viewer.id) return null;
  const own = baseAccessFor(viewer);
  for (const slice of slicesOf(share.card, sender, at)) {
    if (hiddenFrom(own, slice, at)) return slice;
  }
  return null;
}

/** Who may approve a request for this slice: the sender when they may grant it, else the first person who may; null when nobody can. */
export function approverFor(requester: User, slice: GrantSlice, senderId: string, at: Date): User | null {
  const candidates = [findUser(senderId), ...USERS.filter((user) => user.id !== senderId)].filter((user): user is User => user !== null && user !== undefined);
  return candidates.find((user) => refusalFor(user, requester, slice, DEFAULT_GRANT_DAYS, at) === null) ?? null;
}

function pendingRequestOf(requesterId: string, shareCode: string, slice: GrantSlice): GrantRequest | null {
  return grantRequests().where((request) => request.requesterId === requesterId && request.shareCode === shareCode && request.slice.metric === slice.metric && request.status === "pending")[0] ?? null;
}

function liveGrantOf(recipientId: string, slice: GrantSlice, at: Date): Grant | null {
  return grants().where((grant) => grant.recipientId === recipientId && grant.slice.metric === slice.metric && isLiveGrant(grant, at))[0] ?? null;
}

/** What a shared card hides from its viewer, for the first read that showed the sender more, with the viewer's grant, pending request, and whether anyone may approve; null when it hides nothing. */
export function shareScopeFor(share: Share, viewer: User, at = new Date()): ShareScope | null {
  const slice = hiddenSliceOf(share, viewer, at);
  if (!slice) return null;
  const hidden = hiddenFrom(baseAccessFor(viewer), slice, at) ?? slice;
  const grant = liveGrantOf(viewer.id, slice, at);
  const pending = pendingRequestOf(viewer.id, share.id, slice);
  return {
    hidden,
    grant: grant ? { expiresAt: grant.expiresAt, grantorName: nameOf(grant.grantorId) } : null,
    pendingRequest: pending ? { id: pending.id, approverName: nameOf(pending.approverId) } : null,
    requestable: !grant && !pending && approverFor(viewer, slice, share.senderId, at) !== null,
  };
}

/** Where an approver decides a request. */
export function grantRequestPath(requestId: string): string {
  return `${GRANT_PATH}${requestId}`;
}

function mailApprover(request: GrantRequest, requester: User, approver: User): Promise<unknown> {
  const slice = sliceLabel(request.slice);
  const url = `${channelWebOrigin()}${grantRequestPath(request.id)}`;
  return ports().mail.send({ kind: "share", fromUserId: requester.id, toUserId: approver.id, toEmail: approver.email, subject: TH.grant.mailSubject(requester.nameTh, slice), body: TH.grant.mailBody(requester.nameTh, slice, request.reason, url), refId: request.id });
}

/** A recipient asks for what a shared card hid from them: the slice comes from the stored share, never the client; one pending request per share and metric, mailed to its approver and audited. */
export async function requestGrant(requester: User, shareCode: string, reason: string, at = new Date()): Promise<RequestOutcome> {
  const share = shares().get(shareCode);
  if (!share) return { ok: false, problem: "missing" };
  if (!mayOpen(share, requester)) return { ok: false, problem: "not_yours" };
  const slice = hiddenSliceOf(share, requester, at);
  if (!slice) return { ok: false, problem: "nothing_hidden" };
  const pending = pendingRequestOf(requester.id, share.id, slice);
  if (pending) return { ok: true, request: pending };
  const approver = approverFor(requester, slice, share.senderId, at);
  if (!approver) return { ok: false, problem: "no_approver" };
  const request = grantRequests().put({
    id: randomUUID(), requesterId: requester.id, approverId: approver.id, slice, shareCode: share.id, reason: reason.trim().slice(0, REASON_MAX),
    status: "pending", createdAt: at.toISOString(), decidedAt: null, grantId: null,
  });
  await mailApprover(request, requester, approver);
  recordGrantEvent({ userId: requester.id, event: "requested", ref: request.id, slice, recipientId: requester.id, days: null, reason: TH.grant.audit.requested(requester.nameTh, approver.nameTh) });
  return { ok: true, request };
}

/** Only the approver and IT may open a request. */
export function mayDecide(request: GrantRequest, user: User): boolean {
  return request.approverId === user.id || user.role === "it_admin";
}

/** The approver grants a pending request for some days, the rules checked again now; a refusal leaves it pending. */
export function approveRequest(requestId: string, approver: User, days: GrantDays, at = new Date()): DecisionOutcome {
  const request = grantRequests().get(requestId);
  const requester = request ? findUser(request.requesterId) : null;
  if (!request || !requester) return { ok: false, problem: "missing" };
  if (request.approverId !== approver.id) return { ok: false, problem: "not_yours" };
  if (request.status !== "pending") return { ok: false, problem: "decided" };
  const outcome = giveGrant({ grantor: approver, recipient: requester, slice: request.slice, days, shareCode: request.shareCode, requestId, at });
  if (!outcome.ok) return { ok: false, problem: "refused", refusal: outcome.refusal };
  const decided = grantRequests().put({ ...request, status: "approved", decidedAt: at.toISOString(), grantId: outcome.grant.id });
  return { ok: true, request: decided, grant: outcome.grant };
}

/** The approver or IT declines a pending request. */
export function declineRequest(requestId: string, by: User, at = new Date()): DecisionOutcome {
  const request = grantRequests().get(requestId);
  if (!request) return { ok: false, problem: "missing" };
  if (!mayDecide(request, by)) return { ok: false, problem: "not_yours" };
  if (request.status !== "pending") return { ok: false, problem: "decided" };
  const decided = grantRequests().put({ ...request, status: "declined", decidedAt: at.toISOString() });
  recordGrantEvent({ userId: by.id, event: "declined", ref: request.id, slice: request.slice, recipientId: request.requesterId, days: null, reason: TH.grant.audit.declined(nameOf(request.requesterId)) });
  return { ok: true, request: decided, grant: null };
}

/** Ends a live grant now; only its grantor and IT may. */
export function revokeGrant(grantId: string, by: User, at = new Date()): boolean {
  const grant = grants().get(grantId);
  if (!grant || !isLiveGrant(grant, at)) return false;
  if (grant.grantorId !== by.id && by.role !== "it_admin") return false;
  grants().put({ ...grant, revokedAt: at.toISOString(), revokedBy: by.id });
  recordGrantEvent({ userId: by.id, event: "revoked", ref: grant.id, slice: grant.slice, recipientId: grant.recipientId, days: grant.days, reason: TH.grant.audit.revoked(nameOf(grant.recipientId)) });
  return true;
}

/** Every grant live now, the soonest to end first, for IT. */
export function liveGrants(at = new Date()): Grant[] {
  return grants()
    .where((grant) => isLiveGrant(grant, at))
    .sort((left, right) => left.expiresAt.localeCompare(right.expiresAt));
}
