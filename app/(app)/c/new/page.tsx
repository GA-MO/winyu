import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { pressedText, pressFromParam } from "@/components/chat/pressed";
import { TH } from "@/lib/i18n/th";
import { investigations } from "@/lib/server/agent/collections";
import { readAccess } from "@/lib/server/session";
import { openingOf } from "@/lib/server/share/shares";
import { createThread, unusedThread } from "@/lib/server/threads-read";

type SearchParams = Promise<{ prompt?: string; matter?: string; story?: string; press?: string }>;

export const dynamic = "force-dynamic";

/** Starts a thread: `prompt` is sent as the first question, `matter` opens a chat about a matter the person may open (the model reads it as fenced context and the person asks the first question themselves), `story` asks the agent to investigate one of their stories, `press` sends a card's tool button as the in-chat button would. */
export default async function NewThreadPage({ searchParams }: { searchParams: SearchParams }) {
  const access = readAccess(await cookies());
  if (!access) redirect("/login");

  const { prompt, matter: matterCode, story: storyId, press: pressValue } = await searchParams;
  const press = pressValue ? pressFromParam(pressValue) : null;
  if (press) {
    const pressed = createThread(access.userId, press.label);
    redirect(`/c/${pressed.id}?prompt=${encodeURIComponent(pressedText(press))}`);
  }
  const opening = matterCode ? openingOf(matterCode, { id: access.userId }) : null;
  if (opening?.ok) redirect(`/c/${createThread(access.userId, opening.matter.title, { matterCode: opening.matter.id }).id}`);
  const story = storyId ? (investigations().get(access.userId)?.stories.find((entry) => entry.id === storyId) ?? null) : null;
  const first = prompt ?? (story ? TH.stories.askPrompt(story.finding) : null);
  if (!first) redirect(`/c/${(unusedThread(access.userId) ?? createThread(access.userId, "")).id}`);
  const thread = createThread(access.userId, first, null, story?.id ?? null);
  redirect(`/c/${thread.id}?prompt=${encodeURIComponent(first)}`);
}
