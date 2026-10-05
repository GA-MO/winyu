import { shareContacts } from "@/lib/server/share/deliver";
import { requireAccess, unauthenticated } from "../../_guard";

/** Everyone the signed-in person can share a card with, and the channels that reach each of them. */
export async function GET() {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  return Response.json({ contacts: shareContacts(access.userId) });
}
