import { PersonaGrid } from "@/components/login/persona-grid";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { GradientText } from "@/components/ui/gradient-text";
import { USERS } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";

export default function LoginPage() {
  return (
    <main className="relative min-h-dvh overflow-hidden">
      <GlowBackdrop />
      <div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-8 sm:py-20">
        <header className="flex flex-col gap-3">
          <p className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-card">
            <span className="size-1.5 animate-hero-pulse rounded-full bg-success" />
            {TH.app.name} · {TH.app.tagline}
          </p>
          <h1 className="font-display text-[2.25rem] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[3.25rem]">
            {TH.app.name} · <GradientText>{TH.login.title}</GradientText>
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">{TH.login.subtitle}</p>
          <p className="text-xs text-muted-foreground">{TH.login.demoNotice}</p>
        </header>
        <PersonaGrid users={USERS} />
      </div>
    </main>
  );
}
