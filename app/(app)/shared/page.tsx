import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Eye, EyeOff, Forward, KeyRound, Send } from "lucide-react";
import { Activity, WaitingPill } from "@/components/notifications/activity";
import { cn } from "@/components/ui/cn";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { relativeTimeTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import type { ReceivedShare, SentShare } from "@/lib/share/card";
import { updatesFor } from "@/lib/server/bell";
import { decisionCount } from "@/lib/server/inbox";
import { markHomeRead } from "@/lib/server/notify";
import { readUser } from "@/lib/server/session";
import { receivedShares, sentShares } from "@/lib/server/share/lists";
import { revokeGrantAction } from "../g/actions";

export const dynamic = "force-dynamic";

const PATH = "/shared";
const COPY = TH.shared;
const COLUMN = "relative mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-12 sm:px-8";
const LIST = "divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-card";
const ROW_LINK = "flex flex-col gap-1 px-4 py-3 transition hover:bg-muted focus-visible:bg-muted focus-visible:outline-none";

function Section({ title, icon, empty, children, count }: { title: string; icon: React.ReactNode; empty: string; children: React.ReactNode; count: number }) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
        {icon}
        {title}
        <span className="font-normal tabular-nums text-muted-foreground">{count}</span>
      </h2>
      {count === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : <ul className={LIST}>{children}</ul>}
    </section>
  );
}

function ReceivedRow({ share }: { share: ReceivedShare }) {
  return (
    <li data-received-share={share.code}>
      <Link href={share.path} className={ROW_LINK}>
        <span className="flex items-baseline gap-2">
          {share.unread ? <span aria-hidden className="size-1.5 shrink-0 -translate-y-0.5 rounded-full bg-primary" /> : null}
          {share.unread ? <span className="sr-only">{COPY.newMark}</span> : null}
          <span className={cn("min-w-0 flex-1 truncate text-sm", share.unread ? "font-semibold" : "font-medium")}>{share.title}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{relativeTimeTh(share.at)}</span>
        </span>
        <span className="text-xs text-muted-foreground">{COPY.from(share.senderName)}</span>
        {share.note ? <span className="line-clamp-2 text-[13px] leading-relaxed text-foreground/80">“{share.note}”</span> : null}
        {share.grant ? (
          <span className="flex items-center gap-1.5 text-xs text-success">
            <KeyRound className="size-3.5 shrink-0" aria-hidden />
            {COPY.holding(share.grant.until)}
          </span>
        ) : null}
        {!share.grant && share.hidden ? (
          <span className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <EyeOff className="mt-px size-3.5 shrink-0 text-warning" aria-hidden />
            {COPY.hidden(share.hidden)}
          </span>
        ) : null}
        {!share.grant && share.request ? (
          <span className="flex items-center gap-1.5 text-xs text-foreground">
            <KeyRound className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            {COPY.pending(share.request.approverName)}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

function SentRow({ share }: { share: SentShare }) {
  const recipients = share.receipts.map((receipt) => `${receipt.name} (${TH.share.channel[receipt.via] ?? receipt.via})`).join(", ");
  return (
    <li data-sent-share={share.code}>
      <Link href={share.path} className={ROW_LINK}>
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{share.title}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{relativeTimeTh(share.at)}</span>
        </span>
        <span className="text-xs text-muted-foreground">{COPY.to(recipients)}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Eye className="size-3.5 shrink-0" aria-hidden />
          {COPY.opened(share.opened, share.recipients)}
        </span>
      </Link>
      {share.grants.length > 0 ? (
        <ul className="flex flex-col gap-1 px-4 pb-3">
          {share.grants.map((grant) => (
            <li key={grant.id} className="flex items-center gap-2 text-xs" data-given-grant={grant.id}>
              <KeyRound className="size-3.5 shrink-0 text-success" aria-hidden />
              <span className="min-w-0 flex-1 text-foreground/80">{COPY.gave(grant.recipientName, grant.slice, grant.until)}</span>
              <form action={revokeGrantAction}>
                <input type="hidden" name="grant" value={grant.id} />
                <input type="hidden" name="back" value={PATH} />
                <button type="submit" className="min-h-8 rounded-full px-3 font-medium text-muted-foreground transition hover:bg-muted hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {COPY.revoke}
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Shared: what happened for the person by day, the cards colleagues sent them and the cards they sent; opening the page reads its notifications. */
export default async function SharedPage() {
  const viewer = readUser(await cookies());
  if (!viewer) redirect(`/login?next=${encodeURIComponent(PATH)}`);
  const received = receivedShares(viewer);
  const sent = sentShares(viewer);
  const activity = updatesFor(viewer.id);
  const waiting = decisionCount(viewer.id);
  markHomeRead(viewer.id, "shared");

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <GlowBackdrop />
      <div className={COLUMN}>
        <header className="flex flex-col gap-1.5">
          <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">{COPY.title}</h1>
          <p className="text-sm text-muted-foreground">{COPY.subtitle}</p>
          <WaitingPill count={waiting} />
        </header>
        <Activity items={activity} />
        <Section title={COPY.received} icon={<Forward className="size-4 text-primary" aria-hidden />} empty={COPY.receivedEmpty} count={received.length}>
          {received.map((share) => (
            <ReceivedRow key={share.code} share={share} />
          ))}
        </Section>
        <Section title={COPY.sent} icon={<Send className="size-4 text-primary" aria-hidden />} empty={COPY.sentEmpty} count={sent.length}>
          {sent.map((share) => (
            <SentRow key={share.code} share={share} />
          ))}
        </Section>
      </div>
    </div>
  );
}
