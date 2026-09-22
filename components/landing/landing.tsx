"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, MessageSquare } from "lucide-react";
import { SpecView } from "vexa/react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "vexa/ui/tooltip";
import { cn } from "vexa/lib/utils";
import type { QuickAction } from "@/lib/contracts";
import type { AmbientCard } from "@/lib/dashboard/ambient";
import { TH } from "@/lib/i18n/th";
import { CopComposer } from "@/components/composer/cop-composer";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { GradientText } from "@/components/ui/gradient-text";
import { WidgetCards, type WidgetCard } from "@/components/dashboard/widget-cards";

const THREADS_ENDPOINT = "/api/threads";
const QUICK_ACTIONS_ENDPOINT = "/api/quick-actions";
const BACKDROP_CHAT = "pointer-events-none cop-mask-center opacity-40 blur-sm";
const BACKDROP_OPEN = "opacity-100";
const CHIP = "rounded-full border border-border/70 bg-card/70 px-3.5 py-1.5 text-xs text-muted-foreground backdrop-blur transition hover:-translate-y-0.5 hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function Landing({
  greeting,
  brief,
  widgets,
  quickActions,
  ambient,
}: {
  greeting: string;
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

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <GlowBackdrop />

      <div className={cn("absolute inset-0 transition-all duration-500 ease-out", dashboardMode ? BACKDROP_OPEN : BACKDROP_CHAT)}>
        <div className="h-full overflow-y-auto px-4 pb-24 pt-20 sm:px-8">
          <WidgetCards widgets={widgets} />
        </div>
      </div>

      {dashboardMode ? (
        <div className="pointer-events-none sticky top-0 z-10 flex justify-center px-4 pt-4">
          <div className="pointer-events-auto flex w-full max-w-2xl items-center gap-2">
            <CopComposer value={text} onValueChange={setText} onSubmit={start} size="docked" busy={busy} className="flex-1" />
            <button type="button" onClick={() => setDashboardMode(false)} className={cn(CHIP, "shrink-0 py-2.5")}>
              <span className="flex items-center gap-1.5">
                <MessageSquare className="size-3.5" aria-hidden />
                {TH.landing.backToChat}
              </span>
            </button>
          </div>
        </div>
      ) : (
        <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-16 sm:px-6">
          <div className={cn("flex w-full max-w-2xl flex-col gap-6 transition-all duration-300", busy ? "opacity-0" : "opacity-100")}>
            <header className={cn("flex flex-col gap-2 animate-hero-rise transition-all duration-300", busy ? "-translate-y-3" : "")}>
              <h1 className="font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                <GradientText>{greeting}</GradientText>
              </h1>
              <p className="text-sm text-muted-foreground sm:text-base">{brief}</p>
            </header>

            <div className="animate-hero-rise [animation-delay:80ms]">
              <CopComposer
                value={text}
                onValueChange={setText}
                onSubmit={start}
                busy={busy}
                autoFocus
                hint={TH.landing.composerHint}
              />
            </div>

            <TooltipProvider delay={200}>
              <div className="flex flex-wrap gap-2 animate-hero-rise [animation-delay:140ms]">
                {actions.map((action) => (
                  <Tooltip key={action.id}>
                    <TooltipTrigger className={CHIP} onClick={() => void start(action.prompt)}>
                      {action.label}
                    </TooltipTrigger>
                    <TooltipContent>{action.reason}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>

            <div className="flex flex-wrap justify-center gap-3 animate-hero-rise [animation-delay:200ms]">
              {ambient.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => void start(card.prompt)}
                  aria-label={`${TH.landing.openInAgent}: ${card.label}`}
                  className="min-w-0 grow basis-full rounded-2xl text-left transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:basis-[calc(33.333%-0.5rem)]"
                >
                  <SpecView spec={card.spec} showDevtools={false} />
                </button>
              ))}
            </div>

            <div className="flex justify-center animate-hero-rise [animation-delay:260ms]">
              <button type="button" onClick={() => setDashboardMode(true)} className={CHIP}>
                <span className="flex items-center gap-1.5">
                  <LayoutDashboard className="size-3.5" aria-hidden />
                  {TH.landing.viewDashboard}
                  <span className="text-muted-foreground/70">{TH.landing.dashboardHint}</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
