import { badRequest, notFound, readBody, requireAccess, unauthenticated } from "../../_guard";
import { memoryFacts } from "@/lib/server/agent/collections";
import { confirmMemory, editMemory } from "@/lib/engine/memory";

type RouteContext = { params: Promise<{ id: string }> };

type PatchBody = { value?: unknown };

export async function PATCH(req: Request, context: RouteContext) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const id = (await context.params).id;
  const body = await readBody<PatchBody>(req);
  if (body?.value !== undefined && typeof body.value !== "string") return badRequest();
  const owned = memoryFacts().get(id)?.userId === access.userId;
  if (!owned) return notFound();
  const fact = typeof body?.value === "string" ? editMemory(access.userId, id, body.value) : confirmMemory(access.userId, id);
  if (!fact) return badRequest();
  return Response.json({ fact });
}

export async function DELETE(_req: Request, context: RouteContext) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const id = (await context.params).id;
  const fact = memoryFacts().get(id);
  if (!fact || fact.userId !== access.userId) return notFound();
  memoryFacts().remove(id);
  return Response.json({ ok: true });
}
