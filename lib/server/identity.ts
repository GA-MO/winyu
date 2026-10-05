import type { User } from "@/lib/contracts";
import { findUser, USERS } from "@/lib/data/entities/users";
import { collection } from "@/lib/server/store/json-store";

const LINKS_COLLECTION = "identity-links";
const ATTEMPTS_COLLECTION = "sign-in-attempts";

export const IDENTITY_PROVIDERS = ["entra", "line"] as const;

/** The system that vouches for a person: `entra` covers web sign-in and Teams (both carry the Entra object id); `line` covers the LINE channel. */
export type IdentityProvider = (typeof IDENTITY_PROVIDERS)[number];

/** Who an outside system says a person is. Entra: `tenant` is the directory (tid), `subject` the object id (oid). LINE: `tenant` is the channel id, `subject` the LINE user id. */
export type ExternalIdentity = { provider: IdentityProvider; tenant: string; subject: string; email: string | null; name: string | null };

/** One outside identity, as `provider:tenant:subject`; the only key a link or an attempt is stored under. */
export type IdentityKey = string & { readonly __brand: "IdentityKey" };

/** An outside identity IT has granted a Winyu user; permission then comes from that user's role, never from the provider. */
export type IdentityLink = ExternalIdentity & { id: IdentityKey; userId: string; linkedBy: string; linkedAt: string };

/** Someone the provider vouched for whom no link maps yet; IT sees these and grants or dismisses them. */
export type SignInAttempt = ExternalIdentity & { id: IdentityKey; firstAt: string; lastAt: string; count: number };

const links = () => collection<IdentityLink>(LINKS_COLLECTION);
const attempts = () => collection<SignInAttempt>(ATTEMPTS_COLLECTION);

function byNewest<T>(at: (item: T) => string) {
  return (left: T, right: T) => at(right).localeCompare(at(left));
}

export function identityKey(identity: Pick<ExternalIdentity, "provider" | "tenant" | "subject">): IdentityKey {
  return `${identity.provider}:${identity.tenant}:${identity.subject}` as IdentityKey;
}

/** The Winyu user an identity is linked to, or null when nobody granted it or the user no longer exists. */
export function linkedUser(identity: Pick<ExternalIdentity, "provider" | "tenant" | "subject">): User | null {
  return linkedUserOfKey(identityKey(identity));
}

/** The Winyu user behind a stored identity key; a session re-checks this on every request so unlinking takes effect at once. */
export function linkedUserOfKey(key: IdentityKey): User | null {
  const link = links().get(key);
  return link ? findUser(link.userId) : null;
}

/** Remembers that an unlinked identity tried to sign in, counting repeats, so IT can grant it from /admin. */
export function noteUnlinkedAttempt(identity: ExternalIdentity, at: string): SignInAttempt {
  const id = identityKey(identity);
  const previous = attempts().get(id);
  return attempts().put({ ...identity, id, firstAt: previous?.firstAt ?? at, lastAt: at, count: (previous?.count ?? 0) + 1 });
}

/** Grants an identity to a Winyu user (replacing any earlier link of that identity) and clears its pending attempt; null when the user does not exist. */
export function linkIdentity(identity: ExternalIdentity, userId: string, linkedBy: string, at: string): IdentityLink | null {
  if (!findUser(userId)) return null;
  const id = identityKey(identity);
  attempts().remove(id);
  return links().put({ ...identity, id, userId, linkedBy, linkedAt: at });
}

export function unlinkIdentity(key: IdentityKey): boolean {
  return links().remove(key);
}

export function dismissAttempt(key: IdentityKey): boolean {
  return attempts().remove(key);
}

export function pendingAttempt(key: IdentityKey): SignInAttempt | null {
  return attempts().get(key);
}

export function identityLinks(): IdentityLink[] {
  return links().all().sort(byNewest((link) => link.linkedAt));
}

export function unlinkedAttempts(): SignInAttempt[] {
  return attempts().all().sort(byNewest((attempt) => attempt.lastAt));
}

/** The user whose directory email matches the identity's, offered to IT as a starting choice; the email never grants access by itself. */
export function suggestedUser(identity: Pick<ExternalIdentity, "email">): User | null {
  const email = identity.email?.trim().toLowerCase();
  if (!email) return null;
  return USERS.find((user) => user.email.toLowerCase() === email) ?? null;
}
