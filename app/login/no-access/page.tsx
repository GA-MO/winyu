import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LogIn, ShieldAlert, UserRoundX } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { DENIED_COOKIE, deniedFromCookie } from "@/lib/server/auth/entra";
import { authMode } from "@/lib/server/auth/mode";
import { TH } from "@/lib/i18n/th";

const COPY = TH.sso.noAccess;
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const dynamic = "force-dynamic";

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="w-24 shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 break-all text-sm", mono && "font-mono text-[13px]")}>{value}</dd>
    </div>
  );
}

/** Where an Entra user lands when IT has not linked their account: who they are, what to send IT, and no data. */
export default async function NoAccessPage() {
  if (authMode() !== "entra") redirect("/login");
  const denied = deniedFromCookie((await cookies()).get(DENIED_COOKIE)?.value);
  return (
    <main className="relative min-h-dvh overflow-hidden">
      <GlowBackdrop />
      <div className="relative mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-4 py-12 sm:px-8">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-warning/15 text-warning">
          <ShieldAlert className="size-5" aria-hidden />
        </span>
        <header className="flex flex-col gap-3">
          <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2.25rem]">{COPY.title}</h1>
          <p className="text-sm text-muted-foreground sm:text-base">{COPY.body}</p>
        </header>
        <section className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-card">
          <p className="text-sm">{COPY.ask}</p>
          {denied ? (
            <dl className="flex flex-col gap-2 rounded-2xl bg-muted/60 px-4 py-3">
              <Fact label={COPY.name} value={denied.name ?? COPY.unknown} />
              <Fact label={COPY.email} value={denied.email ?? COPY.unknown} />
              <Fact label={COPY.objectId} value={denied.objectId} mono />
            </dl>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <a href="/api/auth/entra/login" className={cn("inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-ink-foreground transition hover:opacity-90", FOCUS)}>
              <LogIn className="size-4" aria-hidden />
              {COPY.retry}
            </a>
            <a href="/api/auth/entra/logout" className={cn("inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm text-muted-foreground transition hover:text-foreground", FOCUS)}>
              <UserRoundX className="size-4" aria-hidden />
              {COPY.otherAccount}
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
