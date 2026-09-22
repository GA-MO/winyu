"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, MessageSquare, ShieldCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "vexa/ui/tooltip";
import { cn } from "vexa/lib/utils";
import type { QuickAction } from "@/lib/contracts";
import type { AmbientCard, AmbientTone } from "@/lib/dashboard/ambient";
import { TH } from "@/lib/i18n/th";
import { CopComposer } from "@/components/composer/cop-composer";
import { ChipIcon } from "@/components/ui/chip-icon";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { GradientText } from "@/components/ui/gradient-text";
import { PILL } from "@/components/ui/pill";
import { WidgetCards, type WidgetCard } from "@/components/dashboard/widget-cards";

const THREADS_ENDPOINT = "/api/threads";
const QUICK_ACTIONS_ENDPOINT = "/api/quick-actions";
const BACKDROP = "pointer-events-none absolute inset-0 cop-mask-center cop-backdrop-dim";
const PANEL = "w-full max-w-3xl rounded-[2rem] border border-border bg-panel p-5 shadow-panel backdrop-blur-xl sm:p-8";
const AMBIENT = "flex min-w-[15rem] max-w-sm flex-1 basis-0 flex-col gap-1 rounded-2xl border border-border border-l-[3px] bg-card p-4 text-left shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const AMBIENT_ACCENT: Record<AmbientTone, string> = {
  danger: "border-l-danger",
  warning: "border-l-warning",
  info: "border-l-info",
  brand: "border-l-primary",
};

export type Greeting = { lead: string; name: string };

export function Landing({
  greeting,
  brief,
  widgets,
  quickActions,
  ambient,
}: {
  greeting: Greeting;
  brief: string;
  widgets: WidgetCard[];
  quickActions: QuickAction[];
  ambient: AmbientCard[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [actions, setActions] = useState(quickActions);
  const [dashboardMode, setDashboardMode] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(QUICK_ACTIONS_ENDPOINT, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { actions?: QuickAction[] } | null) => {
        if (payload?.actions?.length) setActions(payload.actions);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const start = useCallback(
    async (prompt: string) => {
      if (busy) return;
      setBusy(true);
      const response = await fetch(THREADS_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ firstMessage: prompt }),
      });
      if (!response.ok) {
        setBusy(false);
        return;
      }
      const { id } = (await response.json()) as { id: string };
      router.push(`/c/${id}?prompt=${encodeURIComponent(prompt)}`);
    },
    [busy, router],
  );

  useEffect(() => {
    function toggleDashboard(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "d" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setDashboardMode((current) => !current);
    }
    window.addEventListener("keydown", toggleDashboard);
    return () => window.removeEventListener("keydown", toggleDashboard);
  }, []);

  if (dashboardMode) {
    return (
      <div className="relative min-h-dvh">
        <GlowBackdrop />
        <div className="relative flex min-h-dvh flex-col">
          <div className="sticky top-0 z-20 border-b border-border bg-background/90 px-4 py-3 backdrop-blur sm:px-8">
            <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
              <CopComposer value={text} onValueChange={setText} onSubmit={start} size="docked" busy={busy} className="flex-1" />
              <button type="button" onClick={() => setDashboardMode(false)} className={cn(PILL, "shrink-0 py-2.5")}>
                <MessageSquare className="size-3.5" aria-hidden />
                {TH.landing.backToChat}
              </button>
            </div>
          </div>
          <div className="px-4 pb-16 pt-6 sm:px-8">
            <WidgetCards widgets={widgets} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <GlowBackdrop />

      <div aria-hidden className={BACKDROP}>
        <div className="h-full overflow-hidden px-4 pt-20 sm:px-8">
          <WidgetCards widgets={widgets} />
        </div>
      </div>

      <div className="relative flex min-h-dvh flex-col items-center justify-center gap-5 px-4 pb-16 pt-20 sm:px-6">
        <div className={cn("flex w-full max-w-3xl flex-col items-center gap-5 transition-all duration-300", busy ? "opacity-0" : "opacity-100")}>
          <div className={cn(PANEL, "flex flex-col gap-5 animate-hero-rise")}>
            <header className="flex flex-col gap-2 text-center">
              <h1 className="text-balance font-display text-[1.75rem] font-semibold leading-[1.2] tracking-[-0.02em] sm:text-[3rem]">
                {greeting.lead} <GradientText className="whitespace-nowrap">{greeting.name}</GradientText>
              </h1>
              <p className="text-sm text-muted-foreground sm:text-base">{brief}</p>
            </header>

            <CopComposer value={text} onValueChange={setText} onSubmit={start} busy={busy} autoFocus hint={TH.landing.composerHint} />

            <p className="flex items-center gap-2 rounded-2xl border border-border bg-accent/50 px-3 py-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 shrink-0 text-primary" aria-hidden />
              {TH.landing.infoStrip}
            </p>

            <TooltipProvider delay={200}>
              <div className="flex flex-wrap justify-center gap-2">
                {actions.map((action) => (
                  <Tooltip key={action.id}>
                    <TooltipTrigger className={PILL} onClick={() => void start(action.prompt)}>
                      <ChipIcon text={`${action.label} ${action.prompt}`} />
                      {action.label}
                    </TooltipTrigger>
                    <TooltipContent>{action.reason}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>
          </div>

          <div className="flex w-full flex-wrap justify-center gap-3 animate-hero-rise [animation-delay:160ms]">
            {ambient.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => void start(card.prompt)}
                aria-label={`${TH.landing.openInAgent}: ${card.title}`}
                className={cn(AMBIENT, AMBIENT_ACCENT[card.tone])}
              >
                <span className="text-[11px] font-medium tracking-wide text-muted-foreground">{card.label}</span>
                <span className="text-sm font-semibold tracking-tight">{card.title}</span>
                <span className="line-clamp-2 text-xs text-muted-foreground">{card.body}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col items-center gap-3 animate-hero-rise [animation-delay:220ms]">
            <button type="button" onClick={() => setDashboardMode(true)} className={PILL}>
              <LayoutDashboard className="size-3.5" aria-hidden />
              {TH.landing.viewDashboard}
              <span className="text-muted-foreground/70">{TH.landing.dashboardHint}</span>
            </button>
            <p className="text-center text-xs text-muted-foreground/80">{TH.landing.disclaimer}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
