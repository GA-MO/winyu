"use client";

import { ChevronDown } from "lucide-react";
import type { SignalItem } from "@/lib/cards/present";
import { TH } from "@/lib/i18n/th";
import { cn } from "@/components/ui/cn";

const ACCENT: Record<SignalItem["severity"], string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  info: "bg-primary",
  success: "bg-success",
};

const GAP_TONE: Record<SignalItem["gapTone"], string> = {
  bad: "text-danger",
  good: "text-success",
  neutral: "text-foreground",
};

function SignalHead({ item }: { item: SignalItem }) {
  return (
    <div className="flex items-stretch gap-3">
      <span aria-hidden title={item.severityLabel} className={cn("w-1 shrink-0 rounded-full", ACCENT[item.severity])} />
      <div className="min-w-0 flex-1">
        <span className="sr-only">{item.severityLabel}</span>
        <p className="truncate text-[15px] font-semibold leading-snug">{item.name}</p>
        <p className="truncate text-xs text-muted-foreground">{item.place}</p>
        <p className="mt-1 truncate text-xs tabular-nums text-muted-foreground">{item.numbers}</p>
      </div>
      {item.gap ? (
        <div className="flex shrink-0 flex-col items-end justify-center">
          <span className={cn("font-display text-2xl font-semibold leading-none tabular-nums tracking-tight", GAP_TONE[item.gapTone])}>{item.gap}</span>
          {item.gapCaption ? <span className="mt-1 text-[11px] text-muted-foreground">{item.gapCaption}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function SignalRow({ item }: { item: SignalItem }) {
  if (!item.why) {
    return (
      <li className="rounded-xl border border-border bg-card px-3 py-2.5">
        <SignalHead item={item} />
      </li>
    );
  }
  return (
    <li className="rounded-xl border border-border bg-card">
      <details className="group">
        <summary className="cursor-pointer list-none px-3 py-2.5 [&::-webkit-details-marker]:hidden">
          <SignalHead item={item} />
          <span className="mt-1.5 flex items-center gap-1 pl-4 text-[11px] font-medium text-muted-foreground">
            {TH.dash.whyToggle}
            <ChevronDown aria-hidden className="size-3 transition-transform group-open:rotate-180" />
          </span>
        </summary>
        <p className="border-t border-border px-3 py-2.5 pl-7 text-[13px] leading-relaxed text-muted-foreground">{item.why}</p>
      </details>
    </li>
  );
}

function Rows({ items }: { items: SignalItem[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <SignalRow key={item.id} item={item} />
      ))}
    </ul>
  );
}

/** Anomalies as rows that decide at a glance: who, the gap as the big number, the numbers behind it; the cause opens on demand, and the rows past the first few fold under one toggle so none the reply may cite is dropped. */
export function SignalList({ items, more = [] }: { items: SignalItem[]; more?: SignalItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <Rows items={items} />
      {more.length > 0 ? (
        <details className="group/more flex flex-col gap-2">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
            {TH.dash.moreAlerts(more.length)}
            <ChevronDown aria-hidden className="size-3 transition-transform group-open/more:rotate-180" />
          </summary>
          <div className="mt-2">
            <Rows items={more} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
