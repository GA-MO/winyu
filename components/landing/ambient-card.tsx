"use client";

import { ArrowRight, Send, Sparkles } from "lucide-react";
import type { AmbientCard as AmbientCardData, AmbientTone } from "@/lib/dashboard/ambient";
import { TH } from "@/lib/i18n/th";
import { cn } from "@/components/ui/cn";
import { FeedMenu, type FeedSettle } from "@/components/feed/feed-list";

const ACCENT: Record<AmbientTone, string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  info: "bg-info",
  brand: "bg-primary",
  success: "bg-success",
  neutral: "bg-border",
};
const HEADLINE: Record<AmbientTone, string> = {
  danger: "text-danger",
  warning: "text-warning",
  info: "text-info",
  brand: "text-primary",
  success: "text-success",
  neutral: "text-foreground",
};
const ACTION = "inline-flex shrink-0 items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-ink-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const ASK = "inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-foreground/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type AmbientHandlers = { onOpen: (card: AmbientCardData) => void; onAction: (card: AmbientCardData) => void; onSettle: (key: string, action: FeedSettle) => void };

/** One matter from the user's feed as a card: the number first, coloured by how bad it is, then where, why, and the one thing to do. */
export function AmbientCard({ card, handlers }: { card: AmbientCardData; handlers: AmbientHandlers }) {
  return (
    <article className="relative flex min-w-0 flex-col gap-2.5 overflow-hidden rounded-2xl border border-border bg-card py-4 pl-5 pr-3 shadow-card transition duration-200 hover:shadow-lift">
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", ACCENT[card.tone])} />
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-[11px] font-medium text-muted-foreground">{card.eyebrow}</p>
        {card.feedKey ? <FeedMenu feedKey={card.feedKey} canFinish onSettle={handlers.onSettle} /> : null}
      </div>
      <button type="button" onClick={() => handlers.onOpen(card)} className="flex flex-col gap-1 text-left focus-visible:outline-none">
        {card.headline ? (
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className={cn("font-display text-2xl font-semibold tabular-nums tracking-tight", HEADLINE[card.headline.tone])}>{card.headline.value}</span>
            {card.headline.caption ? <span className="text-xs tabular-nums text-muted-foreground">{card.headline.caption}</span> : null}
          </span>
        ) : null}
        <span className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight">{card.title}</span>
        {card.body ? <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{card.body}</span> : null}
      </button>
      {card.lesson ? (
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-primary">
          <Sparkles className="mt-0.5 size-3 shrink-0" aria-hidden />
          <span className="line-clamp-2">{card.lesson}</span>
        </p>
      ) : null}
      <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
        {card.action ? (
          <button type="button" onClick={() => handlers.onAction(card)} title={card.action.reason} className={ACTION}>
            <Send className="size-3" aria-hidden />
            {card.action.label}
          </button>
        ) : null}
        <button type="button" onClick={() => handlers.onOpen(card)} className={ASK}>
          {card.packetId ? TH.inbox.openInAgent : TH.landing.openInAgent}
          <ArrowRight className="size-3" aria-hidden />
        </button>
      </div>
    </article>
  );
}
