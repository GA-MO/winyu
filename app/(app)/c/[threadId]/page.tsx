import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ChatSession, type SessionPreload } from "@/components/chat/chat-session";
import { findUser } from "@/lib/data/entities/users";
import { openApprovalsOf, threadHistory } from "@/lib/harness/adapters/mastra/history";
import { liveRunOn } from "@/lib/harness/runtime";
import { TH } from "@/lib/i18n/th";
import { quickActionsFor } from "@/lib/server/quick-actions";
import { toolLabelsByName } from "@/lib/server/tools/registry";
import { readAccess } from "@/lib/server/session";
import { openingOf } from "@/lib/server/share/shares";
import { getThread } from "@/lib/server/threads-read";

type PageProps = { params: Promise<{ threadId: string }>; searchParams: Promise<{ prompt?: string }> };

export const dynamic = "force-dynamic";

function preloadOf(matterCode: string | null, userId: string): SessionPreload | null {
  const opening = matterCode ? openingOf(matterCode, { id: userId }) : null;
  if (!opening?.ok) return null;
  const { matter } = opening;
  return { matterCode: matter.id, title: matter.title, fromName: findUser(matter.senderId)?.nameTh ?? matter.senderId };
}

/** One of the person's threads: its saved conversation restored from Mastra memory, the run still replying on it, and the chips and placeholder for their role. */
export default async function ThreadPage({ params, searchParams }: PageProps) {
  const access = readAccess(await cookies());
  if (!access) redirect("/login");

  const { threadId } = await params;
  const thread = getThread(threadId, access.userId);
  if (!thread) redirect("/c/new");

  const { prompt } = await searchParams;
  const messages = await threadHistory(thread.id, access.userId);
  return (
    <ChatSession
      key={thread.id}
      threadId={thread.id}
      initialPrompt={prompt ?? null}
      initialMessages={messages}
      initialApprovals={openApprovalsOf(messages, access.userId)}
      liveRun={liveRunOn(thread.id, access.userId)}
      preload={preloadOf(thread.preload?.matterCode ?? null, access.userId)}
      suggestions={quickActionsFor(access)}
      placeholder={TH.landing.composerPlaceholderFor(access.role)}
      toolLabels={toolLabelsByName()}
    />
  );
}
