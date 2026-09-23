"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronUp, HelpCircle, Pin, PinOff, X } from "lucide-react";
import { SpecView } from "vexa/react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "vexa/ui/hover-card";
import type { Spec } from "vexa/protocol";
import type { WidgetSpec } from "@/lib/contracts";
import type { DashboardChange } from "@/lib/server/briefing";
import { toneOf } from "@/lib/dashboard/metric-display";
import { formatPercent } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";

const WIDGETS_ENDPOINT = "/api/dashboard/widgets";
const LAYOUT_ENDPOINT = "/api/dashboard/layout";
const ICON = "rounded-full bg-card/80 p-1.5 text-muted-foreground shadow-card backdrop-blur transition hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const TRAY = "rounded-2xl border border-dashed border-border bg-muted/30 p-4";
const MASONRY = "gap-5 [&>*]:mb-5 [&>*]:break-inside-avoid columns-1 md:columns-2 xl:columns-3";
const TOOLBAR = "absolute right-3 top-3 z-10 flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100";
const CHIP = "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-card";
const DELTA_TONE = { good: "text-success", bad: "text-danger", neutral: "text-muted-foreground" } as const;

export type DashboardWidgetView = { widget: WidgetSpec; spec: Spec };

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
        {rising ? "+" : ""}
        {formatPercent(Math.round(change.deltaPct * 10) / 10)}
      </span>
    </span>
  );
}

export function DashboardView({
  pinned,
  suggested,
  changes,
  restorable,
}: {
  pinned: DashboardWidgetView[];
  suggested: DashboardWidgetView[];
  changes: DashboardChange[];
  restorable: RestorableLayout | null;
}) {
  const router = useRouter();
  const [pendingChange, startTransition] = useTransition();

  const act = useCallback(
    (widgetId: string, action: "pin" | "unpin" | "up" | "down" | "remove") => {
      startTransition(async () => {
        await fetch(`${WIDGETS_ENDPOINT}/${widgetId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
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
          {pinned.map((view, index) => (
            <div key={view.widget.id} className="group relative animate-hero-rise" style={{ animationDelay: `${index * 50}ms` }}>
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
              <SpecView spec={view.spec} showDevtools={false} />
            </div>
          ))}
        </div>
      </section>

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
                <p className="mb-1.5 truncate text-xs text-muted-foreground">{view.widget.reason ?? TH.dash.reasonTemplate}</p>
                <SpecView spec={view.spec} showDevtools={false} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function WhyCard({ widget }: { widget: WidgetSpec }) {
  return (
    <HoverCard>
      <HoverCardTrigger render={<button type="button" aria-label={TH.dash.why} className={ICON} />}>
        <HelpCircle className="size-3.5" aria-hidden />
      </HoverCardTrigger>
      <HoverCardContent className="w-64 text-xs">
        <p className="font-medium">{TH.dash.why}</p>
        <p className="mt-1 text-muted-foreground">{widget.reason ?? TH.dash.reasonTemplate}</p>
        <p className="mt-1 text-muted-foreground">{TH.dash.source[widget.source]}</p>
      </HoverCardContent>
    </HoverCard>
  );
}
