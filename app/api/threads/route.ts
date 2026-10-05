import { listThreads } from "@/lib/server/threads-read";
import { requireAccess, unauthenticated } from "../_guard";

export async function GET() {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  return Response.json({ threads: listThreads(access.userId) });
}
