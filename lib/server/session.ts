import type { AccessContext, User } from "@/lib/contracts";
import { liveAccessFor } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import { SESSION_COOKIE } from "./session-cookie";

export { SESSION_COOKIE };

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type CookieReader = { get(name: string): { value: string } | undefined };

export function readUser(cookies: CookieReader): User | null {
  const userId = cookies.get(SESSION_COOKIE)?.value;
  if (!userId) return null;
  return findUser(userId);
}

/** The access context of the signed-in persona, or null when the cookie is missing or names no user. */
export function readAccess(cookies: CookieReader): AccessContext | null {
  const user = readUser(cookies);
  return user ? liveAccessFor(user) : null;
}

export function sessionCookie(userId: string) {
  return { name: SESSION_COOKIE, value: userId, httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: SESSION_MAX_AGE_SECONDS };
}

export function clearedSessionCookie() {
  return { name: SESSION_COOKIE, value: "", httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 0 };
}
