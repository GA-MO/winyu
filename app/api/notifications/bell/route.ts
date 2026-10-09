import { requireAccess, unauthenticated } from "../../_guard";
import { bellFor } from "@/lib/server/bell";

/** What the bell opens on: decisions waiting on the person, then their latest updates. */
export async function GET() {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  return Response.json(bellFor(access.userId));
}
