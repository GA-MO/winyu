"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, ShieldCheck, Sparkles } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "vexa/ui/tooltip";
import { cn } from "vexa/lib/utils";
import type { Investigation, QuickAction } from "@/lib/contracts";
import type { LandingKpi } from "@/lib/dashboard/ambient";
import { countsLine, storyCounts, type StoryCounts } from "@/components/dashboard/story-board";
import { StoriesDrawer } from "@/components/stories/drawer";
import type { Tone } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";
import { CopComposer } from "@/components/composer/cop-composer";
import { ChipIcon } from "@/components/ui/chip-icon";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { GradientText } from "@/components/ui/gradient-text";
import { PILL } from "@/components/ui/pill";

const THREADS_ENDPOINT = "/api/threads";
const QUICK_ACTIONS_ENDPOINT = "/api/quick-actions";
const DASHBOARD_PATH = "/dashboard";
const MAX_CHIPS = 4;
const HERO = "flex w-full max-w-3xl flex-col gap-6";
const CHIP_ROW = "-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [mask-image:linear-gradient(to_right,black_80%,transparent)] sm:mx-0 sm:[mask-image:none] sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0 sm:pb-0";
const KPI_COLUMNS: Record<number, string> = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4" };
const KPI_STRIP = "grid w-full grid-cols-2 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1 overflow-hidden rounded-2xl border border-border bg-border gap-px shadow-card transition duration-200 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const DELTA_TONE: Record<Tone, string> = {
  good: "bg-success/10 text-success",
  bad: "bg-danger/10 text-danger",
  neutral: "bg-muted text-muted-foreground",
};
export type Greeting = { lead: string; name: string };

function StoryLine({ counts, onOpen }: { counts: StoryCounts; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className={cn(PILL, "self-center")}>
      <Sparkles className="size-3.5 text-brand-violet" aria-hidden />
      {TH.stories.landingLead(countsLine(counts))}
    </button>
  );
}

function KpiStrip({ kpis }: { kpis: LandingKpi[] }) {
  return (
    <Link href={DASHBOARD_PATH} aria-label={TH.landing.kpiOpen} className={cn(KPI_STRIP, KPI_COLUMNS[kpis.length])}>
      {kpis.map((kpi) => (
        <span key={kpi.id} className="flex min-w-0 flex-col gap-1 bg-card px-4 py-3 text-left">
          <span className="truncate text-[11px] font-medium text-muted-foreground">{kpi.label}</span>
          <span className="font-display text-lg font-semibold leading-tight tabular-nums tracking-tight sm:text-xl">{kpi.value}</span>
          {kpi.note ? <span className="line-clamp-2 text-[11px] font-medium text-warning">{kpi.note}</span> : null}
          {kpi.delta ? (
            <span className="flex min-w-0 items-center gap-1.5 text-[11px]">
              <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 font-medium tabular-nums", DELTA_TONE[kpi.tone])}>{kpi.delta}</span>
              {kpi.detail ? <span className="truncate text-muted-foreground">{kpi.detail}</span> : null}
            </span>
          ) : null}
        </span>
      ))}
    </Link>
  );
}

export function Landing({
  greeting,
  kpis,
  quickActions,
  investigation,
  asOf,
  draft,
  placeholder,
}: {
  greeting: Greeting;
  kpis: LandingKpi[];
  quickActions: QuickAction[];
  investigation: Investigation | null;
  asOf: string;
  draft: string;
  placeholder: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [storiesOpen, setStoriesOpen] = useState(false);
  const [actions, setActions] = useState(quickActions);

  useEffect(() => {
    if (draft) router.replace("/", { scroll: false });
  }, [draft, router]);

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
    async (prompt: string, intentKey?: string, title?: string) => {
      if (busy) return;
      setBusy(true);
      setFailed(false);
      if (!title) setText(prompt);
      if (intentKey) {
        void fetch(QUICK_ACTIONS_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ intentKey, prompt, kind: "quick_action" }),
        }).catch(() => undefined);
      }
      const response = await fetch(THREADS_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ firstMessage: prompt, title }),
      }).catch(() => null);
      if (!response?.ok) {
        setBusy(false);
        setFailed(true);
        return;
      }
      const { id } = (await response.json()) as { id: string };
      router.push(`/c/${id}?prompt=${encodeURIComponent(prompt)}`);
    },
    [busy, router],
  );

  useEffect(() => {
    function openDashboard(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "d" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      router.push(DASHBOARD_PATH);
    }
    window.addEventListener("keydown", openDashboard);
    return () => window.removeEventListener("keydown", openDashboard);
  }, [router]);

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <GlowBackdrop />

      <div className="relative flex min-h-dvh flex-col items-center justify-center gap-8 px-4 pb-16 pt-20 sm:px-6">
        <div className={cn(HERO, "animate-hero-rise")}>
          <header className="flex flex-col gap-2 text-center">
            <h1 className="text-balance font-display text-[1.75rem] font-semibold leading-[1.2] tracking-[-0.02em] sm:text-[3rem]">
              {greeting.lead} <GradientText className="whitespace-nowrap">{greeting.name}</GradientText>
            </h1>
            {investigation ? (
              <StoryLine counts={storyCounts(investigation.stories)} onOpen={() => setStoriesOpen(true)} />
            ) : (
              <p className="text-sm text-muted-foreground sm:text-base">{TH.stories.notYet}</p>
            )}
          </header>

          <CopComposer value={text} onValueChange={setText} onSubmit={start} busy={busy} autoFocus placeholder={placeholder} />
          {failed ? (
            <p role="alert" className="-mt-2 text-center text-xs text-danger">
              {TH.landing.startFailed}
            </p>
          ) : null}

          <TooltipProvider delay={200}>
            <div className={CHIP_ROW}>
              {actions.slice(0, MAX_CHIPS).map((action) => (
                <Tooltip key={action.id}>
                  <TooltipTrigger className={cn(PILL, "shrink-0 whitespace-nowrap")} disabled={busy} onClick={() => void start(action.prompt, action.intentKey)}>
                    <ChipIcon text={`${action.label} ${action.prompt}`} />
                    {action.label}
                  </TooltipTrigger>
                  <TooltipContent>{action.reason}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
        </div>

        {kpis.length > 0 ? (
          <div className="flex w-full max-w-3xl flex-col gap-3 animate-hero-rise [animation-delay:160ms]">
            <KpiStrip kpis={kpis} />
          </div>
        ) : null}

        <div className="flex flex-col items-center gap-3 animate-hero-rise [animation-delay:220ms]">
          <Link href={DASHBOARD_PATH} className={PILL}>
            <LayoutDashboard className="size-3.5" aria-hidden />
            {TH.landing.viewDashboard}
            <span className="hidden text-muted-foreground/70 sm:inline">{TH.landing.dashboardHint}</span>
          </Link>
          <p className="flex flex-wrap items-center justify-center gap-x-1.5 text-center text-xs text-muted-foreground/80">
            <ShieldCheck className="size-3.5 shrink-0 text-primary" aria-hidden />
            {TH.landing.trust} · {TH.landing.disclaimer}
          </p>
        </div>
      </div>
      <StoriesDrawer investigation={investigation} asOf={asOf} open={storiesOpen} onClose={() => setStoriesOpen(false)} />
    </div>
  );
}
