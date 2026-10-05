import { randomBytes } from "node:crypto";
import type { User } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { linkIdentity, type ExternalIdentity, type IdentityLink } from "@/lib/server/identity";
import { collection } from "@/lib/server/store/json-store";

const REQUESTS_COLLECTION = "line-link-requests";
const NONCES_COLLECTION = "line-link-nonces";
const LINK_LIFETIME_MS = 10 * 60 * 1000;
const NONCE_BYTES = 24;

/** A LINE user who asked to be linked: the link token LINE issued for them, who they are on LINE, and when it stops counting. */
export type LineLinkRequest = { id: string; identity: ExternalIdentity; issuedAt: string };

/** The signed-in Winyu user who confirmed a link request; LINE echoes the nonce back in the accountLink event of the LINE user who finished. */
type LineLinkNonce = { id: string; userId: string; lineSubject: string; identity: ExternalIdentity; issuedAt: string };

const requests = () => collection<LineLinkRequest>(REQUESTS_COLLECTION);
const nonces = () => collection<LineLinkNonce>(NONCES_COLLECTION);

function fresh(issuedAt: string, now: Date): boolean {
  return now.getTime() - new Date(issuedAt).getTime() <= LINK_LIFETIME_MS;
}

/** Remembers the LINE user a link token was issued to, so the web page can name them and the finish can check it is the same person. */
export function holdLinkRequest(linkToken: string, identity: ExternalIdentity, now: Date = new Date()): LineLinkRequest {
  return requests().put({ id: linkToken, identity, issuedAt: now.toISOString() });
}

/** The pending request behind a link token, while it is fresh. */
export function linkRequest(linkToken: string, now: Date = new Date()): LineLinkRequest | null {
  const request = requests().get(linkToken);
  return request && fresh(request.issuedAt, now) ? request : null;
}

/** The signed-in user confirms the request: it is spent, and a one-time nonce now binds the LINE user to this Winyu user until LINE reports the finish. Null when the token is unknown, stale or already used. */
export function confirmLinkRequest(linkToken: string, user: User, now: Date = new Date()): string | null {
  const request = linkRequest(linkToken, now);
  if (!request) return null;
  requests().remove(linkToken);
  const nonce = randomBytes(NONCE_BYTES).toString("base64url");
  nonces().put({ id: nonce, userId: user.id, lineSubject: request.identity.subject, identity: request.identity, issuedAt: now.toISOString() });
  return nonce;
}

/** LINE's accountLink event for `lineSubject` finished with `nonce`: links that LINE identity to the user who confirmed, once. Null when the nonce is unknown, stale, spent, or was issued for a different LINE user. */
export function finishLink(nonce: string, lineSubject: string, now: Date = new Date()): { link: IdentityLink; user: User } | null {
  const held = nonces().get(nonce);
  if (!held) return null;
  nonces().remove(nonce);
  if (!fresh(held.issuedAt, now) || held.lineSubject !== lineSubject) return null;
  const user = findUser(held.userId);
  const link = user ? linkIdentity(held.identity, user.id, user.id, now.toISOString()) : null;
  return link && user ? { link, user } : null;
}
