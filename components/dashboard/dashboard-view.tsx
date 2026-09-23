"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronUp, CircleCheck, HelpCircle, Pin, PinOff, X } from "lucide-react";
import { SpecView } from "vexa/react";
import { cn } from "vexa/lib/utils";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "vexa/ui/hover-card";
import type { Spec } from "vexa/protocol";
import type { WidgetSpec } from "@/lib/contracts";
import type { DashboardChange } from "@/lib/server/briefing";
import { formatDelta, toneOf } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";
import type { Attention } from "@/lib/dashboard/attention";
import { SeenTracker } from "./seen-tracker";

const WIDGETS_ENDPOINT = "/api/dashboard/widgets";
const LAYOUT_ENDPOINT = "/api/dashboard/layout";
const ICON = "rounded-full bg-card/80 p-1.5 text-muted-foreground shadow-card backdrop-blur transition hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const TRAY = "rounded-2xl border border-dashed border-border bg-muted/30 p-4";
const MASONRY = "gap-5 [&>*]:mb-5 [&>*]:break-inside-avoid columns-1 md:columns-2 xl:columns-3";
const TOOLBAR = "absolute right-3 top-3 z-10 flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100";
const CHIP = "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-card";
const DELTA_TONE = { good: "text-success", bad: "text-danger", neutral: "text-muted-foreground" } as const;
const QUICK_ACTIONS_ENDPOINT = "/api/quick-actions";
const PANEL = "overflow-hidden rounded-2xl border border-border bg-card shadow-card";
const ROW_BUTTON = "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition hover:border-foreground/25 hover:text-foreground disabled:opacity-50";

export type DashboardWidgetHeadline = { value: string; delta: string | null; tone: keyof typeof DELTA_TONE };

export type DashboardWidgetView = { widget: WidgetSpec; spec: Spec; attention: Attention; headline: DashboardWidgetHeadline | null };

export type RestorableLayout = { version: number; savedAt: string };

function ChangeChip({ change }: { change: DashboardChange }) {
  if (change.deltaPct === null || !change.metric) {
    return <span className={CHIP}>{change.label}</span>;
  }
  const rising = change.deltaPct > 0;
  const Arrow = rising ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={CHIP}>
      <span className="text-foreground">{change.label}</span>
      <span className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${DELTA_TONE[toneOf(change.metric, change.deltaPct)]}`}>
        <Arrow className="size-3" aria-hidden />
        {formatDelta(change.deltaPct)}
      </span>
    </span>
  );
}

export function DashboardView({
  pinned,
  suggested,
  stale,
  changes,
  restorable,
}: {
  pinned: DashboardWidgetView[];
  suggested: DashboardWidgetView[];
  stale: WidgetSpec[];
  changes: DashboardChange[];
  restorable: RestorableLayout | null;
}) {
  const router = useRouter();
  const [pendingChange, startTransition] = useTransition();
  const moved = pinned.filter((view) => view.attention.level === "moved");
  const steady = pinned.filter((view) => view.attention.level === "steady");

  const act = useCallback(
    (widgetId: string, action: "pin" | "unpin" | "up" | "down" | "remove") => {
      startTransition(async () => {
        await fetch(`${WIDGETS_ENDPOINT}/${widgetId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
        router.refresh();
      });
    },
    [router],
  );

  const keep = useCallback(
    (widgetId: string) => {
      startTransition(async () => {
        await fetch(QUICK_ACTIONS_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ intentKey: `widget:${widgetId}`, kind: "widget_view" }),
        });
        router.refresh();
      });
    },
    [router],
  );

  const restore = useCallback(() => {
    startTransition(async () => {
      await fetch(LAYOUT_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "rollback" }) });
      router.refresh();
    });
  }, [router]);

  return (
    <div className="flex flex-col gap-8">
      {changes.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{TH.dashboard.changes}</h2>
          <div className="flex flex-wrap gap-2">
            {changes.map((change) => (
              <ChangeChip key={change.label} change={change} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{TH.dash.pinnedZone}</h2>
          {restorable ? (
            <button type="button" disabled={pendingChange} onClick={restore} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition hover:text-foreground">
              {TH.compose.yesterday}
            </button>
          ) : null}
        </div>
        {pinned.length === 0 ? <p className="text-sm text-muted-foreground">{TH.dash.empty}</p> : null}
        <div className={MASONRY}>
          {moved.map((view, index) => (
            <SeenTracker key={view.widget.id} widgetId={view.widget.id} className="group relative">
              <div className="animate-hero-rise" style={{ animationDelay: `${index * 50}ms` }}>
                <div className={TOOLBAR}>
                  <WhyCard widget={view.widget} />
                  <button type="button" disabled={pendingChange} onClick={() => act(view.widget.id, "up")} aria-label={TH.dash.moveUp} className={ICON}>
                    <ChevronUp className="size-3.5" aria-hidden />
                  </button>
                  <button type="button" disabled={pendingChange} onClick={() => act(view.widget.id, "down")} aria-label={TH.dash.moveDown} className={ICON}>
                    <ChevronDown className="size-3.5" aria-hidden />
                  </button>
                  <button type="button" disabled={pendingChange} onClick={() => act(view.widget.id, "unpin")} aria-label={TH.dash.unpin} className={ICON}>
                    <PinOff className="size-3.5" aria-hidden />
                  </button>
                </div>
                {view.attention.reason ? (
                  <p className="mb-1.5 flex items-center gap-1.5 truncate text-xs font-medium text-foreground">
                    <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-warning" />
                    {view.attention.reason}
                  </p>
                ) : null}
                <SpecView spec={view.spec} showDevtools={false} />
              </div>
            </SeenTracker>
          ))}
        </div>
        {steady.length > 0 ? <SteadyPanel views={steady} pending={pendingChange} onUnpin={(id) => act(id, "unpin")} /> : null}
      </section>

      {stale.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{TH.attention.staleZone}</h2>
            <p className="text-xs text-muted-foreground">{TH.attention.staleHint}</p>
          </div>
          <ul className={cn(PANEL, "divide-y divide-border")}>
            {stale.map((widget) => (
              <li key={widget.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className="min-w-0 truncate text-sm font-medium">{widget.title}</span>
                <span className="flex gap-1.5">
                  <button type="button" disabled={pendingChange} onClick={() => keep(widget.id)} className={ROW_BUTTON}>
                    {TH.attention.keep}
                  </button>
                  <button type="button" disabled={pendingChange} onClick={() => act(widget.id, "remove")} className={ROW_BUTTON}>
                    {TH.attention.remove}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{TH.dash.suggestedZone}</h2>
        <div className={TRAY}>
          {suggested.length === 0 ? <p className="text-sm text-muted-foreground">{TH.dash.empty}</p> : null}
          <div className={MASONRY}>
            {suggested.map((view) => (
              <div key={view.widget.id} className="group relative">
                <div className={TOOLBAR}>
                  <button type="button" disabled={pendingChange} onClick={() => act(view.widget.id, "pin")} aria-label={TH.dash.accept} className={ICON}>
                    <Pin className="size-3.5" aria-hidden />
                  </button>
                  <button type="button" disabled={pendingChange} onClick={() => act(view.widget.id, "remove")} aria-label={TH.dash.dismissSuggestion} className={ICON}>
                    <X className="size-3.5" aria-hidden />
                  </button>
                </div>
                <p className="mb-1.5 truncate text-xs text-muted-foreground">{reasonOf(view.widget)}</p>
                <SpecView spec={view.spec} showDevtools={false} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function SteadyPanel({ views, pending, onUnpin }: { views: DashboardWidgetView[]; pending: boolean; onUnpin: (widgetId: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section aria-label={TH.attention.steadyZone(views.length)} className={PANEL}>
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <CircleCheck className="size-3.5 text-success" aria-hidden />
        <h3 className="text-xs font-medium">{TH.attention.steadyZone(views.length)}</h3>
        <p className="hidden truncate text-xs text-muted-foreground sm:block">· {TH.attention.steadyHint}</p>
      </header>
      <ul className="divide-y divide-border">
        {views.map((view) => {
          const expanded = open === view.widget.id;
          return (
            <li key={view.widget.id}>
              <SeenTracker widgetId={view.widget.id}>
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : view.widget.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{view.widget.title}</span>
                    {view.headline ? <span className="shrink-0 text-sm font-semibold tabular-nums">{view.headline.value}</span> : null}
                    {view.headline?.delta ? <span className={cn("shrink-0 text-xs font-medium tabular-nums", DELTA_TONE[view.headline.tone])}>{view.headline.delta}</span> : null}
                    <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition", expanded && "rotate-180")} aria-hidden />
                    <span className="sr-only">{expanded ? TH.attention.collapse : TH.attention.expand}</span>
                  </button>
                  <button type="button" disabled={pending} onClick={() => onUnpin(view.widget.id)} aria-label={TH.dash.unpin} className={cn(ICON, "shadow-none")}>
                    <PinOff className="size-3.5" aria-hidden />
                  </button>
                </div>
                {expanded ? (
                  <div className="border-t border-border bg-muted/30 p-3">
                    <SpecView spec={view.spec} showDevtools={false} />
                  </div>
                ) : null}
              </SeenTracker>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function reasonOf(widget: WidgetSpec): string {
  if (!widget.reason) return TH.dash.reasonTemplate;
  return widget.source === "role_template" ? TH.dash.starterReason(widget.reason) : widget.reason;
}

function WhyCard({ widget }: { widget: WidgetSpec }) {
  return (
    <HoverCard>
      <HoverCardTrigger render={<button type="button" aria-label={TH.dash.why} className={ICON} />}>
        <HelpCircle className="size-3.5" aria-hidden />
      </HoverCardTrigger>
      <HoverCardContent className="w-64 text-xs">
        <p className="font-medium">{TH.dash.why}</p>
        <p className="mt-1 text-muted-foreground">{reasonOf(widget)}</p>
        <p className="mt-1 text-muted-foreground">{TH.dash.source[widget.source]}</p>
      </HoverCardContent>
    </HoverCard>
  );
}
