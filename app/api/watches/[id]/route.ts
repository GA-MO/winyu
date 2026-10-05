import { notFound, requireAccess, unauthenticated } from "../../_guard";
import { removeWatch } from "@/lib/server/watches";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, context: RouteContext) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  return removeWatch(access.userId, (await context.params).id) ? Response.json({ ok: true }) : notFound();
}
