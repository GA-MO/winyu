import { LogIn, LogOut } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { GradientText } from "@/components/ui/gradient-text";
import { TH } from "@/lib/i18n/th";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const SIGN_IN_PATH = "/api/auth/entra/login";
const SIGN_OUT_PATH = "/api/auth/entra/logout";

/** Why the last attempt did not sign the person in, each explained in TH.sso.errors. */
export type SignInProblem = keyof typeof TH.sso.errors;

/** The sign-in page when MASCOP_AUTH is entra: one Microsoft button, no persona picker. */
export function EntraSignIn({ next, signedOut, problem }: { next: string; signedOut: boolean; problem: SignInProblem | null }) {
  const href = next === "/" ? SIGN_IN_PATH : `${SIGN_IN_PATH}?next=${encodeURIComponent(next)}`;
  return (
    <main className="relative min-h-dvh overflow-hidden">
      <GlowBackdrop />
      <div className="relative mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-8 px-4 py-12 sm:px-8">
        <header className="flex flex-col gap-4">
          <p className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-card">
            <span className="size-1.5 animate-hero-pulse rounded-full bg-success" />
            {TH.app.name} · {TH.app.tagline}
          </p>
          <h1 className="font-display text-[2.25rem] font-semibold leading-[1.15] tracking-[-0.03em] sm:text-[3rem]">
            {TH.sso.heading} <GradientText className="whitespace-nowrap">{TH.sso.headingAccent}</GradientText>
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">{TH.sso.subtitle}</p>
        </header>

        <section className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-card">
          {signedOut ? <p className="text-sm font-medium text-success">{TH.sso.signedOut}</p> : null}
          {problem ? (
            <p role="alert" className="rounded-2xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
              {TH.sso.errors[problem]}
            </p>
          ) : null}
          <a href={href} className={cn("inline-flex h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-ink-foreground shadow-card transition hover:opacity-90", FOCUS)}>
            <LogIn className="size-4" aria-hidden />
            {TH.sso.signIn}
          </a>
          <p className="text-center text-xs text-muted-foreground">{TH.sso.signInHint}</p>
          {signedOut ? (
            <div className="flex flex-col gap-1 border-t border-border pt-4">
              <a href={SIGN_OUT_PATH} className={cn("inline-flex w-fit items-center gap-1.5 rounded-full text-sm text-foreground hover:underline", FOCUS)}>
                <LogOut className="size-4 text-muted-foreground" aria-hidden />
                {TH.sso.signOutMicrosoft}
              </a>
              <p className="text-xs text-muted-foreground">{TH.sso.signOutMicrosoftHint}</p>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
