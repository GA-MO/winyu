import { badRequest, notFound, readBody, requireAccess, unauthenticated } from "../../_guard";
import { deleteThread, getThread, renameThread } from "@/lib/server/threads-read";

type RouteContext = { params: Promise<{ id: string }> };
type RenameBody = { title?: unknown };

export async function GET(_req: Request, context: RouteContext) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const thread = getThread((await context.params).id, access.userId);
  return thread ? Response.json({ thread }) : notFound();
}

export async function PATCH(req: Request, context: RouteContext) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const body = await readBody<RenameBody>(req);
  if (!body || typeof body.title !== "string") return badRequest();
  const thread = renameThread((await context.params).id, access.userId, body.title);
  return thread ? Response.json({ thread }) : notFound();
}

export async function DELETE(_req: Request, context: RouteContext) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const removed = deleteThread((await context.params).id, access.userId);
  return removed ? Response.json({ ok: true }) : notFound();
}
