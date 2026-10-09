import { headers } from "next/headers";
import type { InboxPayload } from "@/components/inbox/types";
import { demoSignIn } from "@/lib/server/auth/demo-sign-in";

const INBOX_PATH = "/api/inbox";

/** The persona's inbox exactly as the drawer gets it: the real route, called over loopback with that persona's demo session; null outside demo sign-in. */
export async function inboxOf(userId: string): Promise<InboxPayload | null> {
  const signIn = demoSignIn(userId);
  if (!signIn.ok) return null;
  const incoming = await headers();
  const origin = `${incoming.get("x-forwarded-proto") ?? "http"}://${incoming.get("host") ?? "localhost"}`;
  const response = await fetch(`${origin}${INBOX_PATH}`, { headers: { cookie: `${signIn.cookie.name}=${signIn.cookie.value}` }, cache: "no-store" });
  return response.ok ? ((await response.json()) as InboxPayload) : null;
}
