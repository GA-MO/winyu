"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, HelpCircle, Pin, PinOff, X } from "lucide-react";
import { SpecView } from "vexa/react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "vexa/ui/hover-card";
import type { Spec } from "vexa/protocol";
import type { WidgetSpec } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";

const WIDGETS_ENDPOINT = "/api/dashboard/widgets";
const ICON = "rounded-full p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const TRAY = "rounded-2xl border border-dashed border-border bg-muted/40 p-4";
const GRID = "grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3";
const CELL = "flex h-full flex-col gap-1.5 [&>*:last-child]:h-full";
const LAYOUT_ENDPOINT = "/api/dashboard/layout";

export type DashboardWidgetView = { widget: WidgetSpec; spec: Spec };

export type RestorableLayout = { version: number; savedAt: string };

export function DashboardView({
  pinned,
  suggested,
  changes,
  restorable,
}: {
  pinned: DashboardWidgetView[];
  suggested: DashboardWidgetView[];
  changes: string[];
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
        <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <h2 className="text-sm font-medium">{TH.dashboard.changes}</h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
            {changes.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">{TH.dash.pinnedZone}</h2>
          {restorable ? (
            <button type="button" disabled={pendingChange} onClick={restore} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition hover:text-foreground">
              {TH.compose.yesterday}
            </button>
          ) : null}
        </div>
        {pinned.length === 0 ? <p className="text-sm text-muted-foreground">{TH.dash.empty}</p> : null}
        <div className={GRID}>
          {pinned.map((view, index) => (
            <div key={view.widget.id} className={`${CELL} animate-hero-rise`} style={{ animationDelay: `${index * 50}ms` }}>
              <div className="flex items-center justify-end gap-0.5">
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
        <h2 className="text-sm font-medium text-muted-foreground">{TH.dash.suggestedZone}</h2>
        <div className={TRAY}>
          <div className={GRID}>
            {suggested.map((view) => (
              <div key={view.widget.id} className={CELL}>
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-xs text-muted-foreground">{view.widget.reason ?? TH.dash.reasonTemplate}</p>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button type="button" disabled={pendingChange} onClick={() => act(view.widget.id, "pin")} aria-label={TH.dash.accept} className={ICON}>
                      <Pin className="size-3.5" aria-hidden />
                    </button>
                    <button type="button" disabled={pendingChange} onClick={() => act(view.widget.id, "remove")} aria-label={TH.dash.dismissSuggestion} className={ICON}>
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </div>
                </div>
                <SpecView spec={view.spec} showDevtools={false} />
              </div>
            ))}
            {suggested.length === 0 ? <p className="text-sm text-muted-foreground">{TH.dash.empty}</p> : null}
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
