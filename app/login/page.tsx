import { PersonaGrid } from "@/components/login/persona-grid";
import { StoryPicker } from "@/components/login/story-picker";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { GradientText } from "@/components/ui/gradient-text";
import { USERS } from "@/lib/data/entities/users";
import { DEMO_STORIES } from "@/lib/demo/stories";
import { TH } from "@/lib/i18n/th";

export default function LoginPage() {
  return (
    <main className="relative min-h-dvh overflow-hidden">
      <GlowBackdrop />
      <div className="relative mx-auto flex max-w-5xl flex-col gap-8 px-4 py-12 sm:px-8 sm:py-20">
        <header className="flex flex-col gap-3">
          <p className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-card">
            <span className="size-1.5 animate-hero-pulse rounded-full bg-success" />
            {TH.app.name} · {TH.app.tagline}
          </p>
          <h1 className="font-display text-[2.25rem] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[3.25rem]">
            {TH.app.name} · <GradientText>{TH.login.storiesTitle}</GradientText>
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">{TH.login.storiesHint}</p>
          <p className="text-xs text-muted-foreground">{TH.login.demoNotice}</p>
        </header>
        <StoryPicker stories={DEMO_STORIES} users={USERS} />
        <details className="group rounded-2xl border border-border bg-card/60 p-4">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground transition hover:text-foreground">{TH.login.everyone(USERS.length)}</summary>
          <div className="mt-4">
            <PersonaGrid users={USERS} />
          </div>
        </details>
      </div>
    </main>
  );
}
