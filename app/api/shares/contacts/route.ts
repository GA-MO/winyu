import { findUser } from "@/lib/data/entities/users";
import { mayGrant } from "@/lib/server/grants";
import { shareContacts } from "@/lib/server/share/deliver";
import { requireAccess, unauthenticated } from "../../_guard";

/** Everyone the signed-in person can share a card with, the channels that reach each of them, and whether they may grant temporary access when they share. */
export async function GET() {
  const access = await requireAccess();
  const sender = access ? findUser(access.userId) : null;
  if (!sender) return unauthenticated();
  return Response.json({ contacts: shareContacts(sender.id), mayGrant: mayGrant(sender) });
}
