"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, HelpCircle, Pin, PinOff, Sparkles, X } from "lucide-react";
import { SpecView } from "vexa/react";
import { cn } from "vexa/lib/utils";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "vexa/ui/hover-card";
import type { Spec } from "vexa/protocol";
import type { WidgetSpec } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import type { Attention } from "@/lib/dashboard/attention";
import { SeenTracker } from "./seen-tracker";

const WIDGETS_ENDPOINT = "/api/dashboard/widgets";
const LAYOUT_ENDPOINT = "/api/dashboard/layout";
const ICON = "rounded-full bg-card/80 p-1.5 text-muted-foreground shadow-card backdrop-blur transition hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const TRAY = "rounded-2xl border border-dashed border-border bg-muted/30 p-4";
const TILES = "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4";
const TILE = "flex h-full w-full flex-col items-start gap-1.5 rounded-2xl border border-border bg-card px-4 py-3 text-left shadow-card transition hover:border-foreground/20 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const MASONRY = "gap-5 [&>*]:mb-5 [&>*]:break-inside-avoid columns-1 md:columns-2 xl:columns-3";
const TOOLBAR = "absolute right-3 top-3 z-10 flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100";
const DELTA_TONE = { good: "text-success", bad: "text-danger", neutral: "text-muted-foreground" } as const;
const QUICK_ACTIONS_ENDPOINT = "/api/quick-actions";
const PANEL = "overflow-hidden rounded-2xl border border-border bg-card shadow-card";
const LEARNED = "flex flex-col gap-4 rounded-2xl border border-brand-violet/30 bg-brand-violet/5 px-5 py-4 shadow-card";
const PRIMARY_BUTTON = "inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50";
const ROW_BUTTON = "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition hover:border-foreground/25 hover:text-foreground disabled:opacity-50";

export type DashboardWidgetHeadline = { value: string; delta: string | null; tone: keyof typeof DELTA_TONE };

export type DashboardWidgetView = { widget: WidgetSpec; spec: Spec; attention: Attention; headline: DashboardWidgetHeadline | null };

export type RestorableLayout = { version: number; savedAt: string };

export function DashboardView({
  pinned,
  learned,
  suggested,
  stale,
  restorable,
}: {
  pinned: DashboardWidgetView[];
  learned: DashboardWidgetView[];
  suggested: DashboardWidgetView[];
  stale: WidgetSpec[];
  restorable: RestorableLayout | null;
}) {
  const router = useRouter();
  const [pendingChange, startTransition] = useTransition();
  const moved = pinned.filter((view) => view.attention.level === "moved");
  const steady = pinned.filter((view) => view.attention.level === "steady");

  const act = useCallback(
    (widgetId: string, action: "pin" | "unpin" | "remove") => {
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
        {pinned.length > 0 ? <PinnedTiles views={[...moved, ...steady]} pending={pendingChange} onUnpin={(id) => act(id, "unpin")} /> : null}
      </section>

      {learned.map((view) => (
        <LearnedCard key={view.widget.id} view={view} pending={pendingChange} onPin={() => act(view.widget.id, "pin")} onDismiss={() => act(view.widget.id, "remove")} />
      ))}

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

      {suggested.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{TH.dash.suggestedZone}</h2>
          <div className={TRAY}>
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
      ) : null}
    </div>
  );
}

function LearnedCard({ view, pending, onPin, onDismiss }: { view: DashboardWidgetView; pending: boolean; onPin: () => void; onDismiss: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <article className={LEARNED}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-72 flex-col gap-1">
          <p className="flex items-center gap-1.5 text-xs font-medium text-brand-violet">
            <Sparkles className="size-3.5" aria-hidden />
            {TH.dash.learnedZone} · {reasonOf(view.widget)}
          </p>
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-display text-lg font-semibold leading-snug">{view.widget.title}</span>
            {view.headline ? <span className="text-lg font-semibold tabular-nums">{view.headline.value}</span> : null}
            {view.headline?.delta ? <span className={cn("text-sm font-medium tabular-nums", DELTA_TONE[view.headline.tone])}>{view.headline.delta}</span> : null}
          </p>
          <p className="text-xs text-muted-foreground">{TH.dash.learnedHint}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={cn(ROW_BUTTON, "inline-flex items-center gap-1")}>
            {open ? TH.dash.hideCard : TH.dash.showCard}
            <ChevronDown className={cn("size-3.5 transition", open && "rotate-180")} aria-hidden />
          </button>
          <button type="button" disabled={pending} onClick={onDismiss} className={ROW_BUTTON}>
            {TH.dash.dismissSuggestion}
          </button>
          <button type="button" disabled={pending} onClick={onPin} className={PRIMARY_BUTTON}>
            <Pin className="size-3.5" aria-hidden />
            {TH.dash.acceptLearned}
          </button>
        </div>
      </div>
      {open ? (
        <div className="max-w-md">
          <SpecView spec={view.spec} showDevtools={false} />
        </div>
      ) : null}
    </article>
  );
}

function PinnedTiles({ views, pending, onUnpin }: { views: DashboardWidgetView[]; pending: boolean; onUnpin: (widgetId: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const opened = views.find((view) => view.widget.id === open) ?? null;
  return (
    <div className="flex flex-col gap-3">
      <ul className={TILES}>
        {views.map((view) => {
          const expanded = open === view.widget.id;
          const moved = view.attention.level === "moved";
          return (
            <li key={view.widget.id}>
              <SeenTracker widgetId={view.widget.id} className="h-full">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : view.widget.id)}
                  className={cn(TILE, expanded && "border-foreground/30 shadow-lift")}
                >
                  <span className="line-clamp-2 text-xs text-muted-foreground">{view.widget.title}</span>
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-display text-xl font-semibold tabular-nums tracking-tight">{view.headline?.value ?? "—"}</span>
                    {view.headline?.delta ? <span className={cn("text-xs font-medium tabular-nums", DELTA_TONE[view.headline.tone])}>{view.headline.delta}</span> : null}
                  </span>
                  {moved && view.attention.reason ? (
                    <span className="flex items-start gap-1.5 text-xs text-foreground">
                      <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warning" />
                      <span className="line-clamp-2">{view.attention.reason}</span>
                    </span>
                  ) : null}
                </button>
              </SeenTracker>
            </li>
          );
        })}
      </ul>
      {opened ? (
        <div className="relative animate-hero-rise">
          <div className="absolute right-3 top-3 z-10 flex items-center gap-0.5">
            <WhyCard widget={opened.widget} />
            <button type="button" disabled={pending} onClick={() => onUnpin(opened.widget.id)} aria-label={TH.dash.unpin} className={ICON}>
              <PinOff className="size-3.5" aria-hidden />
            </button>
          </div>
          <SpecView spec={opened.spec} showDevtools={false} />
        </div>
      ) : null}
    </div>
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
