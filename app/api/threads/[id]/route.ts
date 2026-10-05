import { forgetThread } from "@/lib/harness/adapters/mastra/history";
import { forgetConversation } from "@/lib/harness/adapters/mastra/recall";
import { deleteThread, renameThread } from "@/lib/server/threads-read";
import { badRequest, notFound, readBody, requireAccess, unauthenticated } from "../../_guard";

type RouteContext = { params: Promise<{ id: string }> };
type RenameBody = { title?: unknown };

export const runtime = "nodejs";

export async function PATCH(req: Request, context: RouteContext) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const body = await readBody<RenameBody>(req);
  if (!body || typeof body.title !== "string" || !body.title.trim()) return badRequest();
  const thread = renameThread((await context.params).id, access.userId, body.title);
  return thread ? Response.json({ thread: { id: thread.id, title: thread.title } }) : notFound();
}

/** Deletes the thread's record, its conversation in Mastra memory and its place in recall. */
export async function DELETE(_req: Request, context: RouteContext) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const id = (await context.params).id;
  if (!deleteThread(id, access.userId)) return notFound();
  await forgetThread(id, access.userId);
  await forgetConversation(access.userId, id);
  return Response.json({ ok: true });
}
