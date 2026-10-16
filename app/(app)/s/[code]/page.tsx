import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowRight, Forward, Lock, MessageSquarePlus } from "lucide-react";
import { MatterPageActions } from "@/components/matter/matter-page-actions";
import { SharedBody } from "@/components/share/shared-body";
import { cn } from "@/components/ui/cn";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { Portrait } from "@/components/ui/portrait";
import { findUser } from "@/lib/data/entities/users";
import { formatDateTh, relativeTimeTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { personaOf } from "@/lib/server/portraits";
import { readUser } from "@/lib/server/session";
import { briefOf } from "@/lib/server/share/act";
import { pathSteps, threadLines, type PathStep } from "@/lib/server/share/matter-view";
import { noteView, openingOf } from "@/lib/server/share/shares";
import { openShare } from "@/lib/server/share/view";
import type { Matter } from "@/lib/share/matter";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ code: string }> };

const COLUMN = "relative mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-12 sm:px-8";
const PANEL = "flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-card";
const STATE_TONE: Record<PathStep["state"], string> = {
  sender: "bg-primary/10 text-primary",
  sent: "bg-muted text-muted-foreground",
  seen: "bg-info/10 text-info",
  accepted: "bg-success/10 text-success",
  asked: "bg-warning/15 text-foreground",
  passed_on: "bg-muted text-muted-foreground",
};

function Closed({ title, body }: { title: string; body: string }) {
  return (
    <div className="relative min-h-page overflow-hidden">
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

function stateLabel(state: PathStep["state"]): string {
  return state === "sender" ? TH.matter.sender : TH.matter.state[state];
}

function PathList({ matter }: { matter: Matter }) {
  return (
    <section className={PANEL} aria-label={TH.matter.pathTitle} data-matter-path>
      <h2 className="text-xs font-medium text-muted-foreground">{TH.matter.pathTitle}</h2>
      <ol className="flex flex-col gap-3">
        {pathSteps(matter).map((step) => (
          <li key={step.key} className="flex items-center gap-3" data-path-state={step.state}>
            <Portrait name={step.name} src={step.photo} className="size-8 text-xs" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{step.name}</span>
              <span className="truncate text-xs text-muted-foreground">{step.title}</span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-0.5">
              <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium", STATE_TONE[step.state])}>{stateLabel(step.state)}</span>
              <span className="text-[11px] text-muted-foreground">{relativeTimeTh(step.at)}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Thread({ matter }: { matter: Matter }) {
  const lines = threadLines(matter);
  if (lines.length === 0) return null;
  return (
    <section className={PANEL} aria-label={TH.matter.threadTitle}>
      <h2 className="text-xs font-medium text-muted-foreground">{TH.matter.threadTitle}</h2>
      <ol className="flex flex-col gap-2.5">
        {lines.map((line) => (
          <li key={line.key} className="flex flex-col gap-0.5 text-sm">
            <span className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 font-medium">{line.line}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTimeTh(line.at)}</span>
            </span>
            {line.text ? <span className="leading-relaxed text-foreground/80">{line.text}</span> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** A matter: only its sender and the people on its path may open it; the stored reads run again as the viewer, so each person sees the card under their own permissions, now. A matter that asks for an answer also shows its path, its thread and what the viewer may press. */
export default async function MatterPage({ params }: PageProps) {
  const { code } = await params;
  const viewer = readUser(await cookies());
  if (!viewer) redirect(`/login?next=${encodeURIComponent(`/s/${code}`)}`);
  const opening = openingOf(code, viewer);
  if (!opening.ok) return <Closed title={TH.share[opening.reason].title} body={TH.share[opening.reason].body} />;

  const view = await openShare(opening.matter, viewer);
  const matter = noteView(opening.matter, viewer.id, new Date().toISOString());
  const sender = findUser(matter.senderId);
  const senderPersona = sender ? personaOf(sender) : null;
  const acts = matter.intent === "act";
  const brief = briefOf(matter, viewer.id);

  return (
    <div className="relative min-h-page overflow-hidden">
      <GlowBackdrop />
      <div className={COLUMN}>
        <header className="flex flex-col gap-3">
          <p className="inline-flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Forward className="size-3.5 text-primary" aria-hidden />
            {TH.matter.label[matter.intent]}
            {acts && matter.status === "open" ? <span className={`rounded-full px-2 py-0.5 ${matter.urgency === "now" ? "bg-danger/10 text-danger" : "bg-muted text-foreground"}`} data-matter-urgency>{matter.due ? TH.share.dueBy(formatDateTh(matter.due)) : TH.share.urgency[matter.urgency]}</span> : null}
            {acts && matter.status !== "open" ? <span className="rounded-full bg-success/10 px-2 py-0.5 text-success">{TH.matter.status[matter.status]}</span> : null}
          </p>
          <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]" data-matter-ask>
            {acts && matter.ask ? matter.ask : matter.title}
          </h1>
          {senderPersona ? (
            <div className="flex items-center gap-2.5">
              <Portrait name={senderPersona.nameTh} src={senderPersona.photo} className="size-8 text-xs" />
              <p className="text-sm text-muted-foreground">{TH.matter.sentBy(senderPersona.nameTh, senderPersona.title)}</p>
            </div>
          ) : null}
          {!acts && matter.ask && sender ? (
            <blockquote className="rounded-2xl border border-border bg-card px-4 py-3 text-[15px] leading-relaxed text-foreground">
              <span className="mb-1 block text-xs text-muted-foreground">{TH.matter.askedBy(sender.nameTh)}</span>
              {matter.ask}
            </blockquote>
          ) : null}
          <p className="text-xs text-muted-foreground">{TH.share.asOfNow}</p>
        </header>
        <SharedBody scope={view.scope} reads={view.reads} surface={view.surface} shareCode={matter.id} senderName={sender?.nameTh ?? null} />
        {acts && brief.actions.length > 0 ? (
          <section className={PANEL} aria-label={TH.matter.label.act}>
            <MatterPageActions brief={brief} />
          </section>
        ) : null}
        {acts ? <PathList matter={matter} /> : null}
        {acts ? <Thread matter={matter} /> : null}
        <Link href={`/c/new?matter=${encodeURIComponent(matter.id)}`} className="inline-flex items-center gap-2 self-start rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-ink-foreground transition hover:opacity-90">
          <MessageSquarePlus className="size-4" aria-hidden />
          {TH.share.askFollowUp}
        </Link>
      </div>
    </div>
  );
}
