import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ElevatedCard } from "@/components/ui/elevated-card";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { GradientText } from "@/components/ui/gradient-text";
import { formatDateTh, formatTimeTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { outbox } from "@/lib/server/agent/collections";
import { findUser } from "@/lib/data/entities/users";
import { readAccess } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export default async function OutboxPage() {
  const access = readAccess(await cookies());
  if (!access) redirect("/login");

  const entries = outbox()
    .where((entry) => entry.fromUserId === access.userId)
    .sort((left, right) => right.at.localeCompare(left.at));

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <GlowBackdrop />
      <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-8">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-[-0.02em]">
            <GradientText>{TH.outbox.title}</GradientText>
          </h1>
          <p className="text-sm text-muted-foreground">{TH.outbox.note}</p>
        </header>
        {entries.length === 0 ? <p className="text-sm text-muted-foreground">{TH.outbox.empty}</p> : null}
        {entries.map((entry) => (
          <ElevatedCard
            key={entry.id}
            title={entry.subject}
            description={`${TH.outbox.to} ${findUser(entry.toUserId)?.nameTh ?? entry.toEmail} · ${formatDateTh(entry.at)} ${formatTimeTh(entry.at)}`}
          >
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{entry.body}</p>
          </ElevatedCard>
        ))}
      </div>
    </div>
  );
}
