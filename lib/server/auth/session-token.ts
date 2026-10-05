import type { IdentityKey } from "@/lib/server/identity";
import { SESSION_COOKIE } from "@/lib/server/session-cookie";
import { authMode } from "./mode";
import { sessionSecret } from "./secret";
import { openToken, sealToken } from "./signed-token";

const SESSION_PURPOSE = "session";
const DEMO_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const ENTRA_MAX_AGE_SECONDS = 60 * 60 * 12;
const MS_PER_SECOND = 1000;

/** Who the session belongs to and how they proved it; an Entra session also names the identity link it rests on. */
export type Session = { via: "demo"; userId: string } | { via: "entra"; userId: string; identity: IdentityKey };

function sessionOf(data: unknown): Session | null {
  if (typeof data !== "object" || data === null) return null;
  const { via, userId, identity } = data as Record<string, unknown>;
  if (typeof userId !== "string") return null;
  if (via === "demo") return { via, userId };
  if (via === "entra" && typeof identity === "string") return { via, userId, identity: identity as IdentityKey };
  return null;
}

function maxAgeOf(session: Session): number {
  return session.via === "entra" ? ENTRA_MAX_AGE_SECONDS : DEMO_MAX_AGE_SECONDS;
}

/** The session a cookie carries when this server signed it, it has not expired and it was issued by the sign-in mode now in force. */
export function sessionFromCookie(value: string | undefined, now = Date.now()): Session | null {
  if (!value) return null;
  const session = sessionOf(openToken(value, SESSION_PURPOSE, sessionSecret(), now));
  return session && session.via === authMode() ? session : null;
}

/** The signed, httpOnly cookie that carries a session. */
export function sessionCookie(session: Session, now = Date.now()) {
  const maxAge = maxAgeOf(session);
  const value = sealToken(SESSION_PURPOSE, session, now + maxAge * MS_PER_SECOND, sessionSecret());
  return { name: SESSION_COOKIE, value, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge };
}

export function clearedSessionCookie() {
  return { name: SESSION_COOKIE, value: "", httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 0 };
}
