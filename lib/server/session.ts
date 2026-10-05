import type { AccessContext, User } from "@/lib/contracts";
import { liveAccessFor } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import { linkedUserOfKey } from "@/lib/server/identity";
import { sessionFromCookie } from "@/lib/server/auth/session-token";
import { SESSION_COOKIE } from "./session-cookie";

export { SESSION_COOKIE };
export { clearedSessionCookie, sessionCookie } from "@/lib/server/auth/session-token";

type CookieReader = { get(name: string): { value: string } | undefined };

/** The signed-in user; an Entra session counts only while IT still links its identity to that same user. */
export function readUser(cookies: CookieReader): User | null {
  const session = sessionFromCookie(cookies.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  if (session.via === "entra" && linkedUserOfKey(session.identity)?.id !== session.userId) return null;
  return findUser(session.userId);
}

/** The access context of the signed-in persona, or null when the cookie is missing, forged, expired or names no user. */
export function readAccess(cookies: CookieReader): AccessContext | null {
  const user = readUser(cookies);
  return user ? liveAccessFor(user) : null;
}
