import { notFound, requireAccess, unauthenticated } from "../../_guard";
import { memoryFacts } from "@/lib/server/agent/collections";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, context: RouteContext) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const id = (await context.params).id;
  const fact = memoryFacts().get(id);
  if (!fact || fact.userId !== access.userId) return notFound();
  memoryFacts().remove(id);
  return Response.json({ ok: true });
}
