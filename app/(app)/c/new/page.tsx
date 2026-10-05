import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TH } from "@/lib/i18n/th";
import { investigations, packets } from "@/lib/server/agent/collections";
import { readAccess } from "@/lib/server/session";
import { createThread, unusedThread } from "@/lib/server/threads-read";

type SearchParams = Promise<{ prompt?: string; preload?: string; story?: string }>;

export const dynamic = "force-dynamic";

/** Starts a thread: `prompt` is sent as the first question, `preload` opens a handoff packet addressed to the person, `story` asks the agent to investigate one of their stories. */
export default async function NewThreadPage({ searchParams }: { searchParams: SearchParams }) {
  const access = readAccess(await cookies());
  if (!access) redirect("/login");

  const { prompt, preload, story: storyId } = await searchParams;
  const story = storyId ? (investigations().get(access.userId)?.stories.find((entry) => entry.id === storyId) ?? null) : null;
  const packet = preload ? packets().get(preload) : null;
  const preloadNote = packet && packet.toUserId === access.userId ? { packetId: packet.id, systemNote: `${packet.title} — ${packet.ask}` } : null;
  const opening = prompt ?? (story ? TH.stories.askPrompt(story.finding) : null) ?? (packet && preloadNote ? TH.handoff.preloadPrompt(packet.title, packet.ask) : null);
  if (!opening) redirect(`/c/${(unusedThread(access.userId) ?? createThread(access.userId, "")).id}`);
  const thread = createThread(access.userId, opening, preloadNote, story?.id ?? null);
  redirect(`/c/${thread.id}?prompt=${encodeURIComponent(opening)}`);
}
