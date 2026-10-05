import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ChatSession, type SessionPreload } from "@/components/chat/chat-session";
import { findUser } from "@/lib/data/entities/users";
import { openApprovalsOf, threadHistory } from "@/lib/harness/adapters/mastra/history";
import { TH } from "@/lib/i18n/th";
import { packets } from "@/lib/server/agent/collections";
import { quickActionsFor } from "@/lib/server/quick-actions";
import { readAccess } from "@/lib/server/session";
import { getThread } from "@/lib/server/threads-read";

type PageProps = { params: Promise<{ threadId: string }>; searchParams: Promise<{ prompt?: string; preload?: string }> };

export const dynamic = "force-dynamic";

function preloadOf(packetId: string | null, userId: string): SessionPreload | null {
  if (!packetId) return null;
  const packet = packets().get(packetId);
  if (!packet || packet.toUserId !== userId) return null;
  return { packetId, fromName: findUser(packet.fromUserId)?.nameTh ?? packet.fromUserId };
}

/** One of the person's threads: its saved conversation restored from Mastra memory, with the chips and placeholder for their role. */
export default async function ThreadPage({ params, searchParams }: PageProps) {
  const access = readAccess(await cookies());
  if (!access) redirect("/login");

  const { threadId } = await params;
  const thread = getThread(threadId, access.userId);
  if (!thread) redirect("/c/new");

  const { prompt, preload } = await searchParams;
  const messages = await threadHistory(thread.id, access.userId);
  return (
    <ChatSession
      key={thread.id}
      threadId={thread.id}
      initialPrompt={prompt ?? null}
      initialMessages={messages}
      initialApprovals={openApprovalsOf(messages, access.userId)}
      preload={preloadOf(preload ?? thread.preload?.packetId ?? null, access.userId)}
      suggestions={quickActionsFor(access)}
      placeholder={TH.landing.composerPlaceholderFor(access.role)}
    />
  );
}
