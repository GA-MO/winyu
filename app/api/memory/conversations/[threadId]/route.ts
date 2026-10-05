import { forgetConversation } from "@/lib/harness/adapters/mastra/recall";
import { getThread } from "@/lib/server/threads-read";
import { notFound, requireAccess, unauthenticated } from "../../../_guard";

type RouteContext = { params: Promise<{ threadId: string }> };

export const runtime = "nodejs";

/** Takes one of the person's conversations out of recall; the thread stays in the chat history. */
export async function DELETE(_req: Request, context: RouteContext) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const threadId = (await context.params).threadId;
  if (!getThread(threadId, access.userId)) return notFound();
  await forgetConversation(access.userId, threadId);
  return Response.json({ ok: true });
}
