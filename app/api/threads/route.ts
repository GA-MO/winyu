import { badRequest, readBody, requireAccess, unauthenticated } from "../_guard";
import { createThread, listThreads } from "@/lib/server/threads-read";
import { packets } from "@/lib/server/agent/collections";

type CreateBody = { firstMessage?: unknown; title?: unknown; preloadPacketId?: unknown };

function preloadOf(packetId: string | null, userId: string) {
  if (!packetId) return null;
  const packet = packets().get(packetId);
  if (!packet || packet.toUserId !== userId) return null;
  return { packetId, systemNote: `${packet.title} — ${packet.ask}` };
}

export async function GET() {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  return Response.json({ threads: listThreads(access.userId) });
}

export async function POST(req: Request) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const body = await readBody<CreateBody>(req);
  if (!body) return badRequest();
  const firstMessage = typeof body.firstMessage === "string" ? body.firstMessage : "";
  const packetId = typeof body.preloadPacketId === "string" ? body.preloadPacketId : null;
  const title = typeof body.title === "string" && body.title.trim() ? body.title : firstMessage;
  const thread = createThread(access.userId, title, preloadOf(packetId, access.userId));
  return Response.json({ id: thread.id, title: thread.title });
}
