import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SessionChat, type SessionPreload } from "@/components/chat/session-chat";
import { findUser } from "@/lib/data/entities/users";
import { packets } from "@/lib/server/agent/collections";
import { quickActionsFor } from "@/lib/server/quick-actions";
import { getThread } from "@/lib/server/threads-read";
import { readAccess } from "@/lib/server/session";

type PageProps = { params: Promise<{ threadId: string }>; searchParams: Promise<{ prompt?: string; preload?: string }> };

export const dynamic = "force-dynamic";

function preloadOf(packetId: string | null, userId: string): SessionPreload | null {
  if (!packetId) return null;
  const packet = packets().get(packetId);
  if (!packet || packet.toUserId !== userId) return null;
  return { packetId, fromName: findUser(packet.fromUserId)?.nameTh ?? packet.fromUserId };
}

export default async function SessionPage({ params, searchParams }: PageProps) {
  const access = readAccess(await cookies());
  if (!access) redirect("/login");

  const { threadId } = await params;
  const thread = getThread(threadId, access.userId);
  if (!thread) redirect("/");

  const { prompt, preload } = await searchParams;
  const packetId = preload ?? thread.preload?.packetId ?? null;

  return (
    <SessionChat
      threadId={thread.id}
      initialPrompt={prompt ?? null}
      preload={preloadOf(packetId, access.userId)}
      suggestions={quickActionsFor(access)}
    />
  );
}
