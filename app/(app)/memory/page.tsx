import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { GradientText } from "@/components/ui/gradient-text";
import { MemoryManager, type MemoryRow } from "@/components/memory/memory-manager";
import { lastSeenAt, memoryStatus, seenCount } from "@/lib/engine/memory-status";
import { pruneMemory } from "@/lib/engine/memory";
import { TH } from "@/lib/i18n/th";
import { memoryFacts } from "@/lib/server/agent/collections";
import { readAccess } from "@/lib/server/session";
import { getThread } from "@/lib/server/threads-read";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const access = readAccess(await cookies());
  if (!access) redirect("/login");
  pruneMemory(access.userId);

  const rows: MemoryRow[] = memoryFacts()
    .where((fact) => fact.userId === access.userId)
    .sort((left, right) => right.confidence - left.confidence || lastSeenAt(right).localeCompare(lastSeenAt(left)))
    .map((fact) => ({
      id: fact.id,
      type: fact.type,
      value: fact.value,
      status: memoryStatus(fact),
      seen: seenCount(fact),
      lastSeenAt: lastSeenAt(fact),
      threadId: fact.sourceThreadId && getThread(fact.sourceThreadId, access.userId) ? fact.sourceThreadId : null,
      fromAction: fact.sourceThreadId === null,
    }));

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <GlowBackdrop />
      <div className="relative mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-8">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-[-0.02em]">
            <GradientText>{TH.memoryPage.title}</GradientText>
          </h1>
          <p className="text-sm text-muted-foreground">{TH.memoryPage.note}</p>
        </header>
        <MemoryManager initial={rows} />
      </div>
    </div>
  );
}
