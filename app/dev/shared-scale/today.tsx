import Link from "next/link";
import { Eye, EyeOff, Forward, KeyRound, Send } from "lucide-react";
import { Activity } from "@/components/notifications/activity";
import { cn } from "@/components/ui/cn";
import { relativeTimeTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import type { ReceivedShare, SentShare } from "@/lib/share/card";
import type { ScaleFixture } from "./fixture";

const COPY = TH.shared;
const LIST = "divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-card";
const ROW_LINK = "flex flex-col gap-1 px-4 py-3 transition hover:bg-muted focus-visible:bg-muted focus-visible:outline-none";

function Section({ title, icon, children, count }: { title: string; icon: React.ReactNode; children: React.ReactNode; count: number }) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
        {icon}
        {title}
        <span className="font-normal tabular-nums text-muted-foreground">{count}</span>
      </h2>
      <ul className={LIST}>{children}</ul>
    </section>
  );
}

function ReceivedRow({ share }: { share: ReceivedShare }) {
  return (
    <li data-today-row="received">
      <Link href={share.path} className={ROW_LINK}>
        <span className="flex items-baseline gap-2">
          {share.unread ? <span aria-hidden className="size-1.5 shrink-0 -translate-y-0.5 rounded-full bg-primary" /> : null}
          <span className={cn("min-w-0 flex-1 truncate text-sm", share.unread ? "font-semibold" : "font-medium")}>{share.title}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{relativeTimeTh(share.at)}</span>
        </span>
        <span className="text-xs text-muted-foreground">{COPY.from(share.senderName)}</span>
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
    <li data-today-row="sent">
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
            <li key={grant.id} className="flex items-center gap-2 text-xs">
              <KeyRound className="size-3.5 shrink-0 text-success" aria-hidden />
              <span className="min-w-0 flex-1 text-foreground/80">{COPY.gave(grant.recipientName, grant.slice, grant.until)}</span>
              <button type="button" className="min-h-8 rounded-full px-3 font-medium text-muted-foreground transition hover:bg-muted hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {COPY.revoke}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Today's /shared body over the fixture: the real Activity timeline, then the received and sent lists as the page draws them. */
export function TodayShared({ today }: { today: ScaleFixture["today"] }) {
  return (
    <div className="flex flex-col gap-8" data-today-shared>
      <Activity items={today.activity} />
      <Section title={COPY.received} icon={<Forward className="size-4 text-primary" aria-hidden />} count={today.received.length}>
        {today.received.map((share) => (
          <ReceivedRow key={share.code} share={share} />
        ))}
      </Section>
      <Section title={COPY.sent} icon={<Send className="size-4 text-primary" aria-hidden />} count={today.sent.length}>
        {today.sent.map((share) => (
          <SentRow key={share.code} share={share} />
        ))}
      </Section>
    </div>
  );
}
