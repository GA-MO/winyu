"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck, Sparkles } from "lucide-react";
import type { MorningBrief, QuickAction } from "@/lib/contracts";
import type { LandingKpi } from "@/lib/dashboard/ambient";
import type { Tone } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";
import { cn } from "@/components/ui/cn";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { GradientText } from "@/components/ui/gradient-text";
import { countsLine, storyCounts, type StoryCounts } from "@/components/stories/story-list";
import { StoriesDrawer } from "@/components/stories/drawer";
import { chatHref } from "./chat-entry";
import { ChatLinkActions } from "./chat-link-actions";
import { ChipIcon } from "./chip-icon";
import { LandingComposer } from "./composer";
import { PILL } from "./pill";

const QUICK_ACTIONS_ENDPOINT = "/api/quick-actions";
const DASHBOARD_PATH = "/dashboard";
const MAX_CHIPS = 4;
const PAGE = "relative mx-auto flex min-h-page w-full max-w-3xl flex-col gap-6 px-4 pt-6 md:pt-20 sm:justify-center sm:gap-8 sm:px-6 sm:pb-16";
const ASK_DOCK = "sticky bottom-0 z-10 -mx-4 mt-auto flex flex-col gap-3 bg-gradient-to-t from-background from-70% to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6 sm:static sm:mx-0 sm:mt-0 sm:bg-none sm:p-0";
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
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <span className="truncate">{kpi.label}</span>
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">{kpi.period}</span>
          </span>
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

/** The same landing for every role: the agent speaks first (the morning investigation), then the pinned numbers, then chips learned from use and the question box at the bottom, near the thumb. */
export function Landing({
  greeting,
  kpis,
  quickActions,
  brief,
  asOf,
  placeholder,
}: {
  greeting: Greeting;
  kpis: LandingKpi[];
  quickActions: QuickAction[];
  brief: MorningBrief | null;
  asOf: string;
  placeholder: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [storiesOpen, setStoriesOpen] = useState(false);

  const start = useCallback(
    (prompt: string, intentKey?: string) => {
      if (busy) return;
      setBusy(true);
      if (intentKey) {
        void fetch(QUICK_ACTIONS_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ intentKey, prompt, kind: "quick_action" }),
        }).catch(() => undefined);
      }
      router.push(chatHref({ prompt }));
    },
    [busy, router],
  );

  return (
    <div className="relative min-h-page overflow-x-clip">
      <GlowBackdrop />

      <div className={PAGE}>
        <header className="flex flex-col gap-2 text-center animate-hero-rise">
          <h1 className="text-balance font-display text-[1.75rem] font-semibold leading-[1.2] tracking-[-0.02em] sm:text-[3rem]">
            {greeting.lead} <GradientText className="whitespace-nowrap">{greeting.name}</GradientText>
          </h1>
          {brief ? (
            <StoryLine counts={storyCounts(brief.cards.map((card) => card.story))} onOpen={() => setStoriesOpen(true)} />
          ) : (
            <p className="text-sm text-muted-foreground sm:text-base">{TH.stories.notYet}</p>
          )}
        </header>

        <div className="flex flex-col gap-3 animate-hero-rise [animation-delay:120ms]">
          {kpis.length > 0 ? <KpiStrip kpis={kpis} /> : null}
          <p className="flex flex-wrap items-center justify-center gap-x-1.5 text-center text-xs text-muted-foreground/80">
            <ShieldCheck className="size-3.5 shrink-0 text-primary" aria-hidden />
            {TH.landing.trust} · {TH.landing.disclaimer}
          </p>
        </div>

        <div className={cn(ASK_DOCK, "animate-hero-rise [animation-delay:200ms]")}>
          <div className={CHIP_ROW} aria-label={TH.landing.quickActions}>
            {quickActions.slice(0, MAX_CHIPS).map((action) => (
              <button key={action.id} type="button" title={action.reason} className={cn(PILL, "shrink-0 whitespace-nowrap")} disabled={busy} onClick={() => start(action.prompt, action.intentKey)}>
                <ChipIcon text={`${action.label} ${action.prompt}`} />
                {action.label}
              </button>
            ))}
          </div>
          <LandingComposer placeholder={placeholder} busy={busy} onSubmit={(prompt) => start(prompt)} />
        </div>
      </div>
      <ChatLinkActions>
        <StoriesDrawer brief={brief} asOf={asOf} open={storiesOpen} onClose={() => setStoriesOpen(false)} />
      </ChatLinkActions>
    </div>
  );
}
