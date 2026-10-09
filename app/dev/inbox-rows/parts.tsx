import type { ReactNode } from "react";
import { MessageSquareText, MoreHorizontal, Sparkles } from "lucide-react";
import { cn } from "@/components/ui/cn";
import type { FeedTone } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import type { Severity, Tone } from "./rows";

export const DELTA_TONE: Record<Tone, string> = { good: "text-success", bad: "text-danger", neutral: "text-muted-foreground" };
export const SEVERITY_FILL: Record<Severity, string> = { P1: "bg-danger", P2: "bg-warning", P3: "bg-info" };
export const SEVERITY_TINT: Record<Severity, string> = { P1: "bg-danger/[0.07]", P2: "bg-warning/[0.08]", P3: "bg-info/[0.07]" };
export const FEED_TONE_TEXT: Record<FeedTone, string> = { danger: "text-danger", warning: "text-warning", info: "text-info", brand: "text-primary", success: "text-success", neutral: "text-muted-foreground" };
export const FEED_TONE_FILL: Record<FeedTone, string> = { danger: "bg-danger", warning: "bg-warning", info: "bg-info", brand: "bg-primary", success: "bg-success", neutral: "bg-muted-foreground/40" };
export const FEED_TONE_TINT: Record<FeedTone, string> = { danger: "bg-danger/[0.07]", warning: "bg-warning/[0.08]", info: "bg-info/[0.07]", brand: "bg-primary/[0.07]", success: "bg-success/[0.07]", neutral: "bg-muted" };

const PRIMARY = "inline-flex shrink-0 items-center justify-center gap-1 rounded-full bg-ink font-medium text-ink-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const QUIET = "inline-flex shrink-0 items-center gap-1 rounded-full text-xs font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const MENU_ITEM = "block w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-foreground hover:bg-muted";

export function Primary({ children, size = "sm", className }: { children: ReactNode; size?: "sm" | "md"; className?: string }) {
  return (
    <button type="button" className={cn(PRIMARY, size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-4 py-2 text-xs", className)}>
      <span className="truncate">{children}</span>
    </button>
  );
}

export function CheckInChat({ className }: { className?: string }) {
  return (
    <button type="button" className={cn(QUIET, "px-2.5 py-1", className)}>
      <MessageSquareText className="size-3.5 text-primary" aria-hidden />
      {TH.inboxRows.checkInChat}
    </button>
  );
}

/** A "…" menu as a native disclosure, so the static prototype can still show it open. */
export function MoreMenu({ items, open = false }: { items: string[]; open?: boolean }) {
  return (
    <details open={open} className="relative shrink-0">
      <summary aria-label={TH.inboxRows.more} className="flex size-7 list-none items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
        <MoreHorizontal className="size-4" aria-hidden />
      </summary>
      <div role="menu" className="absolute bottom-8 right-0 z-20 flex min-w-44 flex-col rounded-xl border border-border bg-popover p-1 shadow-lift">
        {items.map((item) => (
          <button key={item} type="button" role="menuitem" className={MENU_ITEM}>
            {item}
          </button>
        ))}
      </div>
    </details>
  );
}

/** Winyu's reason, at most two lines. */
export function Reason({ text, className }: { text: string; className?: string }) {
  return (
    <p className={cn("flex gap-1.5 text-[13px] leading-relaxed text-foreground/80", className)}>
      <Sparkles className="mt-1 size-3.5 shrink-0 text-primary" aria-hidden />
      <span className="line-clamp-2">{text}</span>
    </p>
  );
}

export function Delta({ value, tone, className }: { value: string | null; tone: Tone; className?: string }) {
  if (!value) return null;
  return <span className={cn("font-display font-semibold tabular-nums", DELTA_TONE[tone], className)}>{value.replace("-", "−")}</span>;
}

/** Close as real or as noise: one control in two halves, so closing stays one decision. */
export function Verdict() {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] text-muted-foreground">{TH.inboxRows.verdict}</span>
      <div role="radiogroup" className="grid grid-cols-2 overflow-hidden rounded-full bg-muted p-0.5 text-xs">
        <button type="button" role="radio" aria-checked="true" className="rounded-full bg-card py-1.5 font-medium shadow-card">
          {TH.inboxRows.real}
        </button>
        <button type="button" role="radio" aria-checked="false" className="rounded-full py-1.5 text-muted-foreground">
          {TH.inboxRows.noise}
        </button>
      </div>
    </div>
  );
}

export function OutcomeField() {
  return <input readOnly placeholder={TH.handoff.outcomePlaceholder} className="w-full rounded-full bg-muted px-3.5 py-2 text-xs outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring" />;
}

/** One drawer-width surface with the annotation that names which state it shows. */
export function Specimen({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="px-1 text-[11px] text-muted-foreground">{label}</figcaption>
      <div className={cn("rounded-2xl border border-border bg-card shadow-panel", className)}>{children}</div>
    </figure>
  );
}
