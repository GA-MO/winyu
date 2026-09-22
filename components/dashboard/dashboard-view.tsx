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
const ICON = "rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const TRAY = "rounded-2xl border border-dashed border-border/70 bg-card/40 p-4";

export type DashboardWidgetView = { widget: WidgetSpec; spec: Spec };

export function DashboardView({ pinned, suggested }: { pinned: DashboardWidgetView[]; suggested: DashboardWidgetView[] }) {
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

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{TH.dash.pinnedZone}</h2>
        {pinned.length === 0 ? <p className="text-sm text-muted-foreground">{TH.dash.empty}</p> : null}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pinned.map((view, index) => (
            <div key={view.widget.id} className="flex flex-col gap-1.5 animate-hero-rise" style={{ animationDelay: `${index * 50}ms` }}>
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {suggested.map((view) => (
              <div key={view.widget.id} className="flex flex-col gap-1.5">
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
