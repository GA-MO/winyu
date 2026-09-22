import { requireAccess, unauthenticated } from "../_guard";
import { quickActionsFor } from "@/lib/server/quick-actions";

export async function GET() {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  return Response.json({ actions: quickActionsFor(access) });
}
