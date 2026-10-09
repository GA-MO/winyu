import type { User } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { authMode } from "./mode";
import { sessionCookie } from "./session-token";

/** Signing in as a persona: the user and the session cookie to set, or why not (`off` outside demo sign-in, `unknown` for no such user). */
export type DemoSignIn = { ok: true; user: User; cookie: ReturnType<typeof sessionCookie> } | { ok: false; reason: "off" | "unknown" };

/** The demo persona sign-in shared by the persona picker and the dev channel panes; only in WINYU_AUTH demo mode. */
export function demoSignIn(userId: string): DemoSignIn {
  if (authMode() !== "demo") return { ok: false, reason: "off" };
  const user = findUser(userId);
  if (!user) return { ok: false, reason: "unknown" };
  return { ok: true, user, cookie: sessionCookie({ via: "demo", userId: user.id }) };
}
