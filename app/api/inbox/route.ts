import { requireAccess, unauthenticated } from "../_guard";
import { inboxFor } from "@/lib/server/inbox";

/** The signed-in person's Inbox: only what waits on their decision, with every number formatted on the server. */
export async function GET() {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  return Response.json(await inboxFor(access));
}
