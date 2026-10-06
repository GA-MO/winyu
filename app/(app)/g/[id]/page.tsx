import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowRight, Check, KeyRound, Lock, X } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { Portrait } from "@/components/ui/portrait";
import { isLiveGrant } from "@/lib/access/enforce";
import { DEFAULT_GRANT_DAYS, GRANT_DAYS, GRANT_REFUSAL_CODES, type Grant, type GrantRefusalCode, type GrantRequest, type User } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { sliceLabel, untilLabel } from "@/lib/share/grant-label";
import { grantRequestPath, grantRequests, grants, mayDecide } from "@/lib/server/grants";
import { personaOf } from "@/lib/server/portraits";
import { readUser } from "@/lib/server/session";
import { shares } from "@/lib/server/share/shares";
import { approveGrantAction, declineGrantAction, revokeGrantAction } from "../actions";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ refused?: string }> };

const COPY = TH.grant.page;
const COLUMN = "relative mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-12 sm:px-8";
const PANEL = "flex flex-col gap-3 rounded-2xl border border-border bg-card p-6 shadow-card";
const LABEL = "text-xs font-medium text-muted-foreground";
const BUTTON = "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Closed({ title, body }: { title: string; body: string }) {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <GlowBackdrop />
      <div className={COLUMN}>
        <section className={cn(PANEL, "items-start")}>
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

function refusedCode(value: string | undefined): GrantRefusalCode | null {
  return GRANT_REFUSAL_CODES.find((code) => code === value) ?? null;
}

function Decide({ request }: { request: GrantRequest }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {GRANT_DAYS.map((days) => (
        <form key={days} action={approveGrantAction}>
          <input type="hidden" name="request" value={request.id} />
          <input type="hidden" name="days" value={days} />
          <button type="submit" className={cn(BUTTON, days === DEFAULT_GRANT_DAYS ? "bg-ink text-ink-foreground hover:opacity-90" : "border border-border text-foreground hover:border-foreground/25")}>
            <Check className="size-4" aria-hidden />
            {COPY.approveFor(days)}
          </button>
        </form>
      ))}
      <form action={declineGrantAction}>
        <input type="hidden" name="request" value={request.id} />
        <button type="submit" className={cn(BUTTON, "text-muted-foreground hover:text-danger")}>
          <X className="size-4" aria-hidden />
          {COPY.decline}
        </button>
      </form>
    </div>
  );
}

function Outcome({ request, grant, viewer }: { request: GrantRequest; grant: Grant | null; viewer: User }) {
  if (request.status === "declined") return <p className="text-sm text-muted-foreground">{COPY.declined}</p>;
  if (!grant) return null;
  const now = new Date();
  if (grant.revokedAt) return <p className="text-sm text-muted-foreground">{COPY.revoked}</p>;
  if (!isLiveGrant(grant, now)) return <p className="text-sm text-muted-foreground">{COPY.expired}</p>;
  const mayRevoke = grant.grantorId === viewer.id || viewer.role === "it_admin";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
        <Check className="size-4" aria-hidden />
        {COPY.approved(untilLabel(grant.expiresAt))}
      </p>
      {mayRevoke ? (
        <form action={revokeGrantAction}>
          <input type="hidden" name="grant" value={grant.id} />
          <input type="hidden" name="back" value={grantRequestPath(request.id)} />
          <button type="submit" className={cn(BUTTON, "border border-border text-muted-foreground hover:text-danger")}>{COPY.revoke}</button>
        </form>
      ) : null}
    </div>
  );
}

/** A grant request as its approver decides it: who asks, why, for what, and 1, 3 or 7 days or no; only the approver and IT may open it. */
export default async function GrantRequestPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const viewer = readUser(await cookies());
  if (!viewer) redirect(`/login?next=${encodeURIComponent(grantRequestPath(id))}`);
  const request = grantRequests().get(id);
  if (!request) return <Closed title={COPY.missing.title} body={COPY.missing.body} />;
  if (!mayDecide(request, viewer)) return <Closed title={COPY.notYours.title} body={COPY.notYours.body} />;

  const requester = findUser(request.requesterId);
  const persona = requester ? personaOf(requester) : null;
  const share = shares().get(request.shareCode);
  const grant = request.grantId ? grants().get(request.grantId) : null;
  const refused = refusedCode((await searchParams).refused);

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <GlowBackdrop />
      <div className={COLUMN}>
        <header className="flex flex-col gap-2">
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <KeyRound className="size-3.5 text-primary" aria-hidden />
            {COPY.title}
          </p>
          <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">{sliceLabel(request.slice)}</h1>
        </header>
        <section className={PANEL}>
          <p className={LABEL}>{COPY.who}</p>
          {persona ? (
            <div className="flex items-center gap-3">
              <Portrait name={persona.nameTh} src={persona.photo} className="size-10 text-sm" />
              <div className="flex min-w-0 flex-col">
                <span className="text-sm font-medium">{persona.nameTh}</span>
                <span className="text-xs text-muted-foreground">{persona.title}</span>
              </div>
            </div>
          ) : null}
          <p className={LABEL}>{COPY.why}</p>
          <p className={cn("text-[15px] leading-relaxed", request.reason ? "text-foreground" : "text-muted-foreground")}>{request.reason || COPY.noReason}</p>
          <p className={LABEL}>{COPY.what}</p>
          <p className="text-[15px] text-foreground">{sliceLabel(request.slice)}</p>
          {share ? <p className="text-xs text-muted-foreground">{COPY.from(share.title)}</p> : null}
        </section>
        {refused ? <p className="text-sm text-danger">{COPY.refused(TH.grant.refusal[refused] ?? refused)}</p> : null}
        {request.status === "pending" && request.approverId === viewer.id ? <Decide request={request} /> : null}
        {request.status === "pending" && request.approverId !== viewer.id ? <DeclineOnly request={request} /> : null}
        <Outcome request={request} grant={grant} viewer={viewer} />
      </div>
    </div>
  );
}

function DeclineOnly({ request }: { request: GrantRequest }) {
  return (
    <form action={declineGrantAction}>
      <input type="hidden" name="request" value={request.id} />
      <button type="submit" className={cn(BUTTON, "border border-border text-muted-foreground hover:text-danger")}>
        <X className="size-4" aria-hidden />
        {COPY.decline}
      </button>
    </form>
  );
}
