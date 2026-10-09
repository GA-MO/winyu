"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MessageSquareText, MoreHorizontal, Sparkles } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { TH } from "@/lib/i18n/th";
import { barsOf } from "./rows";
import type { Movement } from "./types";

export const DELTA_TONE: Record<Movement["tone"], string> = { good: "text-success", bad: "text-danger", neutral: "text-muted-foreground" };
const BAR_TONE: Record<Movement["tone"], string> = { good: "bg-success", bad: "bg-danger", neutral: "bg-muted-foreground" };
const PRIMARY = "inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-ink px-4 text-xs font-medium text-ink-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const QUIET = "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-foreground transition hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const MENU_ITEM = "block w-full rounded-lg px-3 py-2 text-left text-xs text-foreground transition hover:bg-muted focus-visible:bg-muted focus-visible:outline-none";

/** One thing the "…" menu offers. */
export type MenuItem = { label: string; onSelect: () => void };

/** A row of the Inbox: collapsed it is a dot, a title, one line of context and its number; pressed it opens in place, and only then shows what to do. */
export function InboxRow({ open, onToggle, dot, title, context, figure, children, label }: {
  open: boolean;
  onToggle: () => void;
  dot: string;
  title: string;
  context: ReactNode;
  figure: ReactNode;
  children: ReactNode;
  label?: string;
}) {
  const bodyId = useId();
  return (
    <li className={cn("transition-colors", open ? "bg-muted" : "")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
      >
        <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", dot)} />
        {label ? <span className="sr-only">{label}</span> : null}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={cn("text-sm font-semibold leading-snug tracking-tight", open ? "" : "truncate")}>{title}</span>
          <span className={cn("text-xs text-muted-foreground", open ? "line-clamp-2" : "truncate")}>{context}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end leading-tight">{figure}</span>
      </button>
      {open ? (
        <div id={bodyId} className="flex flex-col gap-3 pb-3 pl-[2.125rem] pr-4">
          {children}
        </div>
      ) : null}
    </li>
  );
}

/** The number a row ends on: the delta in its tone, the observed value under it. */
export function Figure({ movement }: { movement: Movement | null }) {
  if (!movement) return null;
  return (
    <>
      {movement.delta ? <span className={cn("font-display text-sm font-semibold tabular-nums", DELTA_TONE[movement.tone])}>{movement.delta.replace("-", "−")}</span> : null}
      <span className="text-[11px] tabular-nums text-muted-foreground">{movement.observed}</span>
    </>
  );
}

/** Winyu's reason, two lines at most. */
export function Reason({ text }: { text: string }) {
  return (
    <p className="flex gap-1.5 text-[13px] leading-relaxed text-foreground/80">
      <Sparkles className="mt-1 size-3.5 shrink-0 text-primary" aria-hidden />
      <span className="line-clamp-2">{text}</span>
    </p>
  );
}

/** ควรเป็น against ตอนนี้ as two bars, with the period the numbers cover. */
export function Bars({ movement, period }: { movement: Movement | null; period: string | null }) {
  const bars = movement ? barsOf(movement.ratio) : null;
  if (!movement || !bars) return period ? <p className="text-[11px] text-muted-foreground">{TH.inbox.period(period)}</p> : null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-[3.25rem_1fr_auto] items-center gap-x-3 gap-y-1.5 text-xs">
        <span className="text-muted-foreground">{TH.inbox.expected}</span>
        <span className="h-1.5 rounded-full bg-muted-foreground/25" style={{ width: `${bars.expected}%` }} />
        <span className="text-right tabular-nums text-muted-foreground">{movement.expected}</span>
        <span className="text-muted-foreground">{TH.inbox.now}</span>
        <span className={cn("h-1.5 rounded-full", BAR_TONE[movement.tone])} style={{ width: `${bars.now}%` }} />
        <span className={cn("text-right font-display font-semibold tabular-nums", DELTA_TONE[movement.tone])}>{movement.observed}</span>
      </div>
      {period ? <p className="text-[11px] text-muted-foreground">{TH.inbox.period(period)}</p> : null}
    </div>
  );
}

export function Primary({ children, onClick, disabled = false }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={PRIMARY}>
      {children}
    </button>
  );
}

export function Quiet({ children, onClick, disabled = false, className }: { children: ReactNode; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cn(QUIET, className)}>
      {children}
    </button>
  );
}

export function CheckInChat({ onClick }: { onClick: () => void }) {
  return (
    <Quiet onClick={onClick}>
      <MessageSquareText className="size-3.5 text-primary" aria-hidden />
      {TH.inbox.checkInChat}
    </Quiet>
  );
}

/** The "…" menu: opened by a press, closed by a choice, a press outside or Escape. */
export function MoreMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [open]);

  if (items.length === 0) return null;
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" aria-label={TH.inbox.more} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <MoreHorizontal className="size-4" aria-hidden />
      </button>
      {open ? (
        <div role="menu" className="absolute bottom-10 right-0 z-20 flex min-w-44 flex-col rounded-xl border border-border bg-popover p-1 shadow-lift">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={MENU_ITEM}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** The actions line of an open row: its one primary press first, the quiet ones after, the menu at the end. */
export function Actions({ children, menu }: { children: ReactNode; menu: MenuItem[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {children}
      <span className="flex-1" />
      <MoreMenu items={menu} />
    </div>
  );
}

/** A choice of a few options as one control in segments. */
export function Segments<T extends string | number>({ label, options, value, onChange, render }: { label: string; options: readonly T[]; value: T; onChange: (value: T) => void; render: (value: T) => string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col overflow-hidden rounded-full bg-card p-0.5 text-xs">
        {options.map((option) => (
          <button
            key={String(option)}
            type="button"
            role="radio"
            aria-checked={option === value}
            onClick={() => onChange(option)}
            className={cn("min-h-8 rounded-full px-3 transition", option === value ? "bg-bubble font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {render(option)}
          </button>
        ))}
      </div>
    </div>
  );
}
