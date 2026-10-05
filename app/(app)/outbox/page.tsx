import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { GradientText } from "@/components/ui/gradient-text";
import { formatDateTh, formatTimeTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { outbox, type OutboxEntry } from "@/lib/server/agent/collections";
import { findUser } from "@/lib/data/entities/users";
import { readAccess } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const FROM_AGENT: ReadonlySet<string> = new Set(["watch", "digest"]);
const TO_ME: ReadonlySet<string> = new Set([...FROM_AGENT, "share"]);
const LINKS_LEAVE_THE_FRAME = '<base target="_top">';
const CARD = "flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-card";

function senderLine(entry: OutboxEntry, userId: string): string {
  if (FROM_AGENT.has(entry.kind)) return TH.outbox.fromWinyu;
  if (entry.toUserId === userId) return `${TH.outbox.from} ${findUser(entry.fromUserId)?.nameTh ?? entry.fromUserId}`;
  return `${TH.outbox.to} ${findUser(entry.toUserId)?.nameTh ?? entry.toEmail}`;
}

/** Mail the person sent through the agent, mail the agent sent them (watch alerts, the morning digest), and cards colleagues shared with them; nothing here left the demo. */
export default async function OutboxPage() {
  const access = readAccess(await cookies());
  if (!access) redirect("/login");

  const entries = outbox()
    .where((entry) => entry.fromUserId === access.userId || (entry.toUserId === access.userId && TO_ME.has(entry.kind)))
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
          <section key={entry.id} className={CARD}>
            <header className="min-w-0">
              <h2 className="truncate text-sm font-semibold tracking-tight">{entry.subject}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {senderLine(entry, access.userId)} · {formatDateTh(entry.at)} {formatTimeTh(entry.at)}
              </p>
            </header>
            {entry.html ? (
              <iframe title={entry.subject} srcDoc={`${LINKS_LEAVE_THE_FRAME}${entry.html}`} sandbox="allow-top-navigation-by-user-activation" className="h-80 w-full rounded-xl border border-border bg-background" />
            ) : (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{entry.body}</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
