"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, LayoutDashboard, Send, ShieldCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "vexa/ui/tooltip";
import { cn } from "vexa/lib/utils";
import { formatActionMessage } from "vexa/react";
import type { NextAction, QuickAction, Story } from "@/lib/contracts";
import { FeedMenu, postFeedAction, type FeedHandlers, type FeedSettle } from "@/components/feed/feed-list";
import type { AmbientCard, AmbientTone, LandingKpi } from "@/lib/dashboard/ambient";
import { StoryTeaser, countsLine, type StoryCounts } from "@/components/dashboard/story-board";
import type { Tone } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";
import { CopComposer } from "@/components/composer/cop-composer";
import { ChipIcon } from "@/components/ui/chip-icon";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { GradientText } from "@/components/ui/gradient-text";
import { PILL } from "@/components/ui/pill";

const THREADS_ENDPOINT = "/api/threads";
const QUICK_ACTIONS_ENDPOINT = "/api/quick-actions";
const ALERTS_ENDPOINT = "/api/alerts";
const DASHBOARD_PATH = "/dashboard";
const INBOX_TODO_QUERY = { inbox: "todo" };
const MAX_CHIPS = 4;
const HERO = "flex w-full max-w-3xl flex-col gap-6";
const CHIP_ROW = "-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [mask-image:linear-gradient(to_right,black_80%,transparent)] sm:mx-0 sm:[mask-image:none] sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0 sm:pb-0";
const AMBIENT = "flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-card p-4 text-left shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-lift focus-within:ring-2 focus-within:ring-ring";
const ACT = "inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-ink-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const AMBIENT_COLUMNS: Record<number, string> = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2" };
const KPI_COLUMNS: Record<number, string> = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4" };
const KPI_STRIP = "grid w-full grid-cols-2 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1 overflow-hidden rounded-2xl border border-border bg-border gap-px shadow-card transition duration-200 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const DELTA_TONE: Record<Tone, string> = {
  good: "bg-success/10 text-success",
  bad: "bg-danger/10 text-danger",
  neutral: "bg-muted text-muted-foreground",
};
const TONE_TEXT: Record<AmbientTone, string> = {
  danger: "text-danger",
  warning: "text-warning",
  info: "text-info",
  brand: "text-primary",
  success: "text-success",
  neutral: "text-foreground",
};
const TONE_DOT: Record<AmbientTone, string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  info: "bg-info",
  brand: "bg-primary",
  success: "bg-success",
  neutral: "bg-muted-foreground",
};
export type Greeting = { lead: string; name: string };

/** One sentence under the greeting, the same for every role: how many matters the inbox holds, or that nothing needs the user. */
function StatusLine({ taskCount }: { taskCount: number }) {
  if (taskCount === 0) return <p className="text-sm text-muted-foreground sm:text-base">{TH.landing.quiet}</p>;
  return (
    <Link href={{ query: INBOX_TODO_QUERY }} scroll={false} className="self-center rounded-full px-3 py-1 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-base">
      {TH.landing.tasksLead(taskCount)}
    </Link>
  );
}

function StoryLine({ counts }: { counts: StoryCounts }) {
  return (
    <Link href={DASHBOARD_PATH} className="self-center rounded-full px-3 py-1 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-base">
      {TH.stories.landingLead(countsLine(counts))}
    </Link>
  );
}

function AmbientCardView({ card, onOpen, onAct, onSettle }: { card: AmbientCard; onOpen: () => void; onAct: (action: NextAction) => void; onSettle: FeedHandlers["onSettle"] }) {
  const action = card.action;
  return (
    <div className={AMBIENT}>
      <div className="flex items-start gap-1">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 pt-1.5 text-[11px] font-medium text-muted-foreground">
          <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[card.tone])} />
          <span className="truncate">{card.eyebrow}</span>
        </span>
        {card.feedKey ? <FeedMenu feedKey={card.feedKey} canFinish onSettle={onSettle} /> : null}
      </div>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-col gap-1.5 text-left focus-visible:outline-none">
        {card.headline ? (
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className={cn("font-display text-2xl font-semibold tabular-nums tracking-tight", TONE_TEXT[card.headline.tone])}>{card.headline.value}</span>
            {card.headline.caption ? <span className="text-xs tabular-nums text-muted-foreground">{card.headline.caption}</span> : null}
          </span>
        ) : null}
        <span className="line-clamp-2 text-sm font-semibold tracking-tight">{card.title}</span>
        {card.body ? <span className="line-clamp-2 text-xs text-muted-foreground">{card.body}</span> : null}
        {card.lesson ? <span className="line-clamp-2 rounded-lg bg-muted px-2 py-1 text-xs text-foreground">{card.lesson}</span> : null}
      </button>
      {action ? (
        <div className="mt-auto flex pt-1">
          <button type="button" onClick={() => onAct(action)} title={action.reason} className={ACT}>
            {action.kind === "handoff" ? <Send className="size-3" aria-hidden /> : <ArrowUpRight className="size-3" aria-hidden />}
            {action.label}
          </button>
        </div>
      ) : null}
    </div>
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
  taskCount,
  quickActions,
  ambient,
  story,
  draft,
  placeholder,
}: {
  greeting: Greeting;
  kpis: LandingKpi[];
  taskCount: number;
  quickActions: QuickAction[];
  ambient: AmbientCard[];
  story: { story: Story; counts: StoryCounts } | null;
  draft: string;
  placeholder: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
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
    async (prompt: string, intentKey?: string, title?: string, preloadPacketId?: string) => {
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
        body: JSON.stringify({ firstMessage: prompt, title, preloadPacketId }),
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

  const openAmbient = useCallback(
    (card: AmbientCard) => {
      if (card.alertId) {
        void fetch(`${ALERTS_ENDPOINT}/${card.alertId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "open" }),
        }).catch(() => undefined);
      } else if (card.feedKey) {
        postFeedAction(card.feedKey, "open");
      }
      void start(card.prompt, undefined, undefined, card.packetId ?? undefined);
    },
    [start],
  );

  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const visibleCards = ambient.filter((card) => !card.feedKey || !hidden.has(card.feedKey));

  const settle = useCallback((key: string, action: FeedSettle) => {
    setHidden((current) => new Set([...current, key]));
    postFeedAction(key, action);
  }, []);

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
            {story ? <StoryLine counts={story.counts} /> : <StatusLine taskCount={taskCount - (ambient.length - visibleCards.length)} />}
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

        <div className="flex w-full max-w-3xl flex-col gap-3 animate-hero-rise [animation-delay:160ms]">
          {kpis.length > 0 ? <KpiStrip kpis={kpis} /> : null}
          {story ? <StoryTeaser story={story.story} counts={story.counts} href={DASHBOARD_PATH} /> : null}
          {!story && visibleCards.length > 0 ? (
            <div className={cn("grid w-full gap-3", AMBIENT_COLUMNS[visibleCards.length])}>
              {visibleCards.map((card) => (
                <AmbientCardView
                  key={card.id}
                  card={card}
                  onSettle={settle}
                  onOpen={() => openAmbient(card)}
                  onAct={(action) => action.tool && void start(formatActionMessage(action.tool, action.input ?? {}), undefined, action.label)}
                />
              ))}
            </div>
          ) : null}
        </div>

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
    </div>
  );
}
