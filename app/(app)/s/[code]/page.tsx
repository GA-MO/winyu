import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowRight, Forward, Lock, MessageSquarePlus } from "lucide-react";
import { ShareScopeNotice } from "@/components/share/share-scope-notice";
import { SharedCardView } from "@/components/share/shared-card-view";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { Portrait } from "@/components/ui/portrait";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { personaOf } from "@/lib/server/portraits";
import { readUser } from "@/lib/server/session";
import { mayOpen, noteView, shares } from "@/lib/server/share/shares";
import { openShare } from "@/lib/server/share/view";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ code: string }> };

const COLUMN = "relative mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-12 sm:px-8";

function Closed({ title, body }: { title: string; body: string }) {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <GlowBackdrop />
      <div className={COLUMN}>
        <section className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-6 shadow-card">
          <Lock className="size-5 text-muted-foreground" aria-hidden />
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
          <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:underline">
            {TH.share.home}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </section>
      </div>
    </div>
  );
}

/** A shared card: only its sender and recipients may open it; the stored reads run again as the viewer, so each person sees the card under their own permissions, now. */
export default async function SharePage({ params }: PageProps) {
  const { code } = await params;
  const viewer = readUser(await cookies());
  if (!viewer) redirect(`/login?next=${encodeURIComponent(`/s/${code}`)}`);
  const share = shares().get(code);
  if (!share) return <Closed title={TH.share.missing.title} body={TH.share.missing.body} />;
  if (!mayOpen(share, viewer)) return <Closed title={TH.share.notYours.title} body={TH.share.notYours.body} />;

  const view = await openShare(share, viewer);
  noteView(share, viewer.id, new Date().toISOString());
  const sender = findUser(share.senderId);
  const senderPersona = sender ? personaOf(sender) : null;
  const followUp = share.question ?? share.title;

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <GlowBackdrop />
      <div className={COLUMN}>
        <header className="flex flex-col gap-3">
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Forward className="size-3.5 text-primary" aria-hidden />
            {TH.share.asOfNow}
          </p>
          <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">{share.title}</h1>
          {senderPersona ? (
            <div className="flex items-center gap-2.5">
              <Portrait name={senderPersona.nameTh} src={senderPersona.photo} className="size-8 text-xs" />
              <p className="text-sm text-muted-foreground">{TH.share.sharedBy(senderPersona.nameTh, senderPersona.title)}</p>
            </div>
          ) : null}
          {share.note && sender ? (
            <blockquote className="rounded-2xl border border-border bg-card px-4 py-3 text-[15px] leading-relaxed text-foreground">
              <span className="mb-1 block text-xs text-muted-foreground">{TH.share.noteFrom(sender.nameTh)}</span>
              {share.note}
            </blockquote>
          ) : null}
        </header>
        {view.scope && sender ? <ShareScopeNotice scope={view.scope} shareCode={share.id} senderName={sender.nameTh} /> : null}
        <SharedCardView reads={view.reads} surface={view.surface} />
        <Link href={`/c/new?prompt=${encodeURIComponent(followUp)}`} className="inline-flex items-center gap-2 self-start rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-ink-foreground transition hover:opacity-90">
          <MessageSquarePlus className="size-4" aria-hidden />
          {TH.share.askFollowUp}
        </Link>
      </div>
    </div>
  );
}
