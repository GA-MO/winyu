"use client";

import { BriefcaseBusiness, Check, Clock, Eye, EyeOff, Megaphone, Server, Sparkles, ListChecks, MapPin, MoreHorizontal, Send, ThumbsUp, TriangleAlert, UserRound, UsersRound, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/components/ui/cn";
import type { FeedAction, FeedItem, FeedSource, FeedTone, NextAction } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";

const FEED_ENDPOINT = "/api/feed";
const SOURCE_ICONS: Record<FeedSource, LucideIcon> = { alert: TriangleAlert, packet: Send, visit: MapPin, person: UserRound, opening: BriefcaseBusiness, watch: Eye, campaign: Megaphone, system: Server, team: UsersRound };
const TONE_PILL: Record<FeedTone, string> = {
  danger: "bg-danger/10 text-danger",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info",
  brand: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  neutral: "bg-muted text-muted-foreground",
};
const ROW_ACTION = "flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const RUN_ACTION = "inline-flex shrink-0 items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-[11px] font-medium text-ink-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type FeedSettle = Exclude<FeedAction, "open">;
export type FeedHandlers = { onOpen: (row: FeedItem) => void; onSettle: (key: string, action: FeedSettle) => void; onRun: (action: NextAction) => void };

/** Tells the server what the user did with one feed item; the list hides the item right away and does not wait. */
export function postFeedAction(key: string, action: FeedAction): void {
  void fetch(FEED_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, action }) }).catch(() => undefined);
}

const MENU_ITEM = "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-foreground transition hover:bg-muted [&>svg]:size-3.5 [&>svg]:text-muted-foreground";

/** Done, put off a week, or not mine; handoffs have none of these because they close in the inbox. */
export function FeedMenu({ feedKey, canFinish, onSettle }: { feedKey: string; canFinish: boolean; onSettle: FeedHandlers["onSettle"] }) {
  const [open, setOpen] = useState(false);
  if (!canFinish) return null;
  const settle = (action: FeedSettle) => {
    setOpen(false);
    onSettle(feedKey, action);
  };
  return (
    <div className="relative">
      <button type="button" aria-label={TH.landing.feedMore} aria-expanded={open} onClick={() => setOpen((value) => !value)} className={ROW_ACTION}>
        <MoreHorizontal className="size-4" aria-hidden />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-8 z-20 flex min-w-40 flex-col rounded-xl border border-border bg-card p-1 shadow-lift">
          <button type="button" role="menuitem" onClick={() => settle("done")} className={MENU_ITEM}>
            <Check aria-hidden />
            {TH.landing.feedDone}
          </button>
          <button type="button" role="menuitem" onClick={() => settle("snooze")} className={MENU_ITEM}>
            <Clock aria-hidden />
            {TH.landing.feedSnooze}
          </button>
          <button type="button" role="menuitem" onClick={() => settle("mute")} className={MENU_ITEM}>
            <EyeOff aria-hidden />
            {TH.landing.feedMute}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FeedRow({ row, handlers }: { row: FeedItem; handlers: FeedHandlers }) {
  const Icon = row.tone === "success" ? ThumbsUp : SOURCE_ICONS[row.source];
  const [action] = row.actions;
  return (
    <li className="flex items-center gap-1 pr-2 transition hover:bg-muted focus-within:bg-muted">
      <button type="button" onClick={() => handlers.onOpen(row)} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left focus-visible:outline-none">
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold tracking-tight" title={row.label}>{row.label}</span>
          {row.detail ? <span className="truncate text-xs text-muted-foreground">{row.detail}</span> : null}
          {row.because ? (
            <span className="flex min-w-0 items-center gap-1 text-[11px] text-primary">
              <Sparkles className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{row.because}</span>
            </span>
          ) : null}
        </span>
        <span className={cn("max-w-[40%] shrink-0 truncate rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums", TONE_PILL[row.tone])}>{row.reason}</span>
      </button>
      {action ? (
        <button type="button" onClick={() => handlers.onRun(action)} title={action.reason} className={cn(RUN_ACTION, "hidden sm:inline-flex")}>
          <Send className="size-3" aria-hidden />
          {action.label}
        </button>
      ) : null}
      <FeedMenu feedKey={row.key} canFinish={row.canFinish} onSettle={handlers.onSettle} />
    </li>
  );
}

/** The matters on a user's feed as rows: what it is, the one reason it is here, the one thing to do about it, and done / later / not mine. */
export function FeedList({ rows, handlers, framed = true }: { rows: FeedItem[]; handlers: FeedHandlers; framed?: boolean }) {
  const list = (
    <ol className="divide-y divide-border">
      {rows.map((row) => (
        <FeedRow key={row.key} row={row} handlers={handlers} />
      ))}
    </ol>
  );
  if (!framed) return list;
  return (
    <section aria-label={TH.landing.tasksTitle} className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <h2 className="flex items-center gap-1.5 border-b border-border px-4 py-2.5 text-[11px] font-medium text-muted-foreground">
        <ListChecks className="size-3.5 text-primary" aria-hidden />
        {TH.landing.tasksTitle}
      </h2>
      {list}
    </section>
  );
}
