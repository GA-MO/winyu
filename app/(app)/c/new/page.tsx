import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { packets } from "@/lib/server/agent/collections";
import { createThread } from "@/lib/server/threads-read";
import { readAccess } from "@/lib/server/session";
import { TH } from "@/lib/i18n/th";

type SearchParams = Promise<{ prompt?: string; preload?: string }>;

export const dynamic = "force-dynamic";

export default async function NewThreadPage({ searchParams }: { searchParams: SearchParams }) {
  const access = readAccess(await cookies());
  if (!access) redirect("/login");

  const { prompt, preload } = await searchParams;
  const packet = preload ? packets().get(preload) : null;
  const preloadNote = packet && packet.toUserId === access.userId ? { packetId: packet.id, systemNote: `${packet.title} — ${packet.ask}` } : null;
  const opening = prompt ?? (packet && preloadNote ? TH.handoff.preloadPrompt(packet.title, packet.ask) : null);
  const thread = createThread(access.userId, opening ?? "", preloadNote);
  redirect(opening ? `/c/${thread.id}?prompt=${encodeURIComponent(opening)}` : `/c/${thread.id}`);
}
