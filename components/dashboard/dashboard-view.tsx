"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, CircleCheck, HelpCircle, Pin, PinOff, Sparkles, X } from "lucide-react";
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
const MASONRY = "gap-5 [&>*]:mb-5 [&>*]:break-inside-avoid columns-1 md:columns-2 xl:columns-3";
const TOOLBAR = "absolute right-3 top-3 z-10 flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100";
const DELTA_TONE = { good: "text-success", bad: "text-danger", neutral: "text-muted-foreground" } as const;
const QUICK_ACTIONS_ENDPOINT = "/api/quick-actions";
const PANEL = "overflow-hidden rounded-2xl border border-border bg-card shadow-card";
const ROW_BUTTON = "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition hover:border-foreground/25 hover:text-foreground disabled:opacity-50";
const KEEP_BUTTON = "shrink-0 rounded-full bg-ink px-3.5 py-1.5 text-xs font-medium text-ink-foreground transition hover:opacity-90 disabled:opacity-50";
const SUGGESTION_BADGE = "absolute left-4 top-0 z-10 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-primary to-brand-violet px-2.5 py-1 text-[11px] font-medium text-primary-foreground shadow-card";

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

  const trayCount = learned.length + suggested.length;

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
        <div className={MASONRY}>
          {moved.map((view, index) => (
            <SeenTracker key={view.widget.id} widgetId={view.widget.id} className="group relative">
              <div className="animate-hero-rise" style={{ animationDelay: `${index * 50}ms` }}>
                <div className={TOOLBAR}>
                  <WhyCard widget={view.widget} />
                  <button type="button" disabled={pendingChange} onClick={() => act(view.widget.id, "unpin")} aria-label={TH.dash.unpin} className={ICON}>
                    <PinOff className="size-3.5" aria-hidden />
                  </button>
                </div>
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

      {trayCount > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{TH.dash.suggestedZone}</h2>
          <div className={TRAY}>
            <div className={MASONRY}>
              {learned.map((view) => (
                <SuggestionCard key={view.widget.id} view={view} pending={pendingChange} onPin={() => act(view.widget.id, "pin")} onDismiss={() => act(view.widget.id, "remove")} />
              ))}
              {suggested.map((view) => (
                <TrayCard key={view.widget.id} view={view} pending={pendingChange} onPin={() => act(view.widget.id, "pin")} onDismiss={() => act(view.widget.id, "remove")} />
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

type TrayCardProps = { view: DashboardWidgetView; pending: boolean; onPin: () => void; onDismiss: () => void };

/** A card Cop proposes from what the user keeps asking: the same card, framed in Cop's gradient with its reason and the decision in plain sight. */
function SuggestionCard({ view, pending, onPin, onDismiss }: TrayCardProps) {
  return (
    <div className="cop-suggested relative pt-3">
      <span className={SUGGESTION_BADGE}>
        <Sparkles className="size-3" aria-hidden />
        {TH.dash.copSuggests}
      </span>
      <SpecView spec={view.spec} showDevtools={false} />
      <div className="mt-2.5 flex items-start gap-2 px-1">
        {view.widget.reason ? <p className="min-w-0 flex-1 pt-1 text-xs leading-relaxed text-muted-foreground">{view.widget.reason}</p> : <span className="flex-1" />}
        <button type="button" disabled={pending} onClick={onDismiss} className={ROW_BUTTON}>
          {TH.dash.dismissSuggestion}
        </button>
        <button type="button" disabled={pending} onClick={onPin} className={KEEP_BUTTON}>
          {TH.dash.keepSuggestion}
        </button>
      </div>
    </div>
  );
}

function TrayCard({ view, pending, onPin, onDismiss }: TrayCardProps) {
  return (
    <div className="group relative">
      <div className={TOOLBAR}>
        <button type="button" disabled={pending} onClick={onPin} aria-label={TH.dash.accept} className={ICON}>
          <Pin className="size-3.5" aria-hidden />
        </button>
        <button type="button" disabled={pending} onClick={onDismiss} aria-label={TH.dash.dismissSuggestion} className={ICON}>
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      <p className="mb-1.5 truncate text-xs text-muted-foreground">{reasonOf(view.widget)}</p>
      <SpecView spec={view.spec} showDevtools={false} />
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
