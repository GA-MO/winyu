import { badRequest, notFound, readBody, requireAccess, unauthenticated } from "../../_guard";
import { deleteThread, getThread, renameThread } from "@/lib/server/threads-read";
import { saveMessages } from "@/lib/server/threads";

type RouteContext = { params: Promise<{ id: string }> };
type RenameBody = { title?: unknown };

export async function GET(_req: Request, context: RouteContext) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const thread = getThread((await context.params).id, access.userId);
  return thread ? Response.json({ thread }) : notFound();
}

export async function POST(req: Request, context: RouteContext) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const body = await readBody<{ messages?: unknown }>(req);
  if (!body || !Array.isArray(body.messages)) return badRequest();
  const saved = await saveMessages((await context.params).id, access.userId, body.messages);
  return saved ? Response.json({ thread: { id: saved.thread.id, title: saved.thread.title }, facts: saved.facts.length }) : notFound();
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
