"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BriefcaseBusiness, Check, Clock, EyeOff, LayoutDashboard, ListChecks, MapPin, MoreHorizontal, Send, ShieldCheck, TriangleAlert, UserRound, type LucideIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "vexa/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "vexa/ui/tooltip";
import { cn } from "vexa/lib/utils";
import { formatActionMessage } from "vexa/react";
import type { FeedAction, FeedItem, FeedSource, NextAction, QuickAction } from "@/lib/contracts";
import type { AmbientCard, AmbientTone, LandingKpi, StatusLink } from "@/lib/dashboard/ambient";
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
const FEED_ENDPOINT = "/api/feed";
const DASHBOARD_PATH = "/dashboard";
const MAX_CHIPS = 4;
const HERO = "flex w-full max-w-3xl flex-col gap-6";
const CHIP_ROW = "-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [mask-image:linear-gradient(to_right,black_80%,transparent)] sm:mx-0 sm:[mask-image:none] sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0 sm:pb-0";
const AMBIENT = "flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-card p-4 text-left shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-lift focus-within:ring-2 focus-within:ring-ring";
const HANDOFF = "inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-ink-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const AMBIENT_COLUMNS: Record<number, string> = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2" };
const KPI_COLUMNS: Record<number, string> = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4" };
const KPI_STRIP = "grid w-full grid-cols-2 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1 overflow-hidden rounded-2xl border border-border bg-border gap-px shadow-card transition duration-200 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const VISIT_TONE: Record<AmbientTone, string> = {
  danger: "bg-danger/10 text-danger",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info",
  brand: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  neutral: "bg-muted text-muted-foreground",
};
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

function StatusLine({ links, taskCount }: { links: StatusLink[]; taskCount: number }) {
  if (links.length === 0) return <p className="text-sm text-muted-foreground sm:text-base">{taskCount > 0 ? TH.landing.tasksLead(taskCount) : TH.landing.quiet}</p>;
  return (
    <p className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1 text-sm">
      <span className="mr-1 text-muted-foreground">{TH.landing.statusLead}</span>
      {links.map((link) => (
        <Link
          key={link.id}
          href={{ query: link.query }}
          scroll={false}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span aria-hidden className={cn("size-1.5 rounded-full", TONE_DOT[link.tone])} />
          <span className="text-muted-foreground">{link.label}</span>
          <span className="font-semibold tabular-nums">{link.count}</span>
        </Link>
      ))}
    </p>
  );
}

function AmbientCardView({ card, onOpen, onHandoff, onAct }: { card: AmbientCard; onOpen: () => void; onHandoff: (action: NextAction) => void; onAct: FeedAct }) {
  const handoff = card.handoff;
  return (
    <div className={AMBIENT}>
      <div className="flex items-start gap-1">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 pt-1.5 text-[11px] font-medium text-muted-foreground">
          <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[card.tone])} />
          <span className="truncate">{card.eyebrow}</span>
        </span>
        {card.alertId ? <FeedMenu feedKey={`alert:${card.alertId}`} canFinish onAct={onAct} /> : null}
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
      {handoff ? (
        <div className="mt-auto flex pt-1">
          <button type="button" onClick={() => onHandoff(handoff)} title={handoff.reason} className={HANDOFF}>
            <Send className="size-3" aria-hidden />
            {handoff.label}
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

const SOURCE_ICONS: Record<FeedSource, LucideIcon> = { alert: TriangleAlert, packet: Send, visit: MapPin, person: UserRound, opening: BriefcaseBusiness };
const ROW_ACTION = "flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type FeedAct = (key: string, action: Exclude<FeedAction, "open">) => void;

function FeedMenu({ feedKey, canFinish, onAct }: { feedKey: string; canFinish: boolean; onAct: FeedAct }) {
  if (!canFinish) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={TH.landing.feedMore} className={ROW_ACTION}>
        <MoreHorizontal className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-40">
        <DropdownMenuItem onClick={() => onAct(feedKey, "done")}>
          <Check aria-hidden />
          {TH.landing.feedDone}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAct(feedKey, "snooze")}>
          <Clock aria-hidden />
          {TH.landing.feedSnooze}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAct(feedKey, "mute")}>
          <EyeOff aria-hidden />
          {TH.landing.feedMute}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FeedList({ rows, onOpen, onAct }: { rows: FeedItem[]; onOpen: (row: FeedItem) => void; onAct: FeedAct }) {
  return (
    <section aria-label={TH.landing.tasksTitle} className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <h2 className="flex items-center gap-1.5 border-b border-border px-4 py-2.5 text-[11px] font-medium text-muted-foreground">
        <ListChecks className="size-3.5 text-primary" aria-hidden />
        {TH.landing.tasksTitle}
      </h2>
      <ol className="divide-y divide-border">
        {rows.map((row) => {
          const Icon = SOURCE_ICONS[row.source];
          return (
            <li key={row.key} className="flex items-center gap-1 pr-2 transition hover:bg-muted focus-within:bg-muted">
              <button type="button" onClick={() => onOpen(row)} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left focus-visible:outline-none">
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold tracking-tight" title={row.label}>{row.label}</span>
                  {row.detail ? <span className="truncate text-xs text-muted-foreground">{row.detail}</span> : null}
                </span>
                <span className={cn("max-w-[45%] shrink-0 truncate rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums", VISIT_TONE[row.tone])}>{row.reason}</span>
              </button>
              <FeedMenu feedKey={row.key} canFinish={row.canFinish} onAct={onAct} />
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function Landing({
  greeting,
  status,
  kpis,
  rows,
  quickActions,
  ambient,
  draft,
  placeholder,
}: {
  greeting: Greeting;
  status: StatusLink[];
  kpis: LandingKpi[];
  rows: FeedItem[];
  quickActions: QuickAction[];
  ambient: AmbientCard[];
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
      }
      void start(card.prompt, undefined, undefined, card.packetId ?? undefined);
    },
    [start],
  );

  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const visibleRows = rows.filter((row) => !hidden.has(row.key));
  const visibleCards = ambient.filter((card) => !card.alertId || !hidden.has(`alert:${card.alertId}`));

  const act = useCallback((key: string, action: Exclude<FeedAction, "open">) => {
    setHidden((current) => new Set([...current, key]));
    void fetch(FEED_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, action }) }).catch(() => undefined);
  }, []);

  const openRow = useCallback(
    (row: FeedItem) => {
      void fetch(FEED_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: row.key, action: "open" }) }).catch(() => undefined);
      void start(row.prompt, undefined, undefined, row.packetId ?? undefined);
    },
    [start],
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
            <StatusLine links={status} taskCount={visibleCards.length + visibleRows.length} />
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
          {visibleRows.length > 0 ? <FeedList rows={visibleRows} onOpen={openRow} onAct={act} /> : null}
          {visibleCards.length > 0 ? (
            <div className={cn("grid w-full gap-3", AMBIENT_COLUMNS[visibleCards.length])}>
              {visibleCards.map((card) => (
                <AmbientCardView
                  key={card.id}
                  card={card}
                  onAct={act}
                  onOpen={() => openAmbient(card)}
                  onHandoff={(action) => action.tool && void start(formatActionMessage(action.tool, action.input ?? {}), undefined, action.label)}
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
