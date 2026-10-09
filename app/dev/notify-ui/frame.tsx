import type { ReactNode } from "react";
import { ArrowUp, Bell, Inbox, LayoutDashboard, Menu, MessageSquarePlus, Share2 } from "lucide-react";
import { BrandMark } from "@/components/chrome/brand-mark";
import { cn } from "@/components/ui/cn";
import { Portrait } from "@/components/ui/portrait";
import { relativeTimeTh, shortName } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import type { NotifyItem, Person } from "./items";

const COPY = TH.notifyUi;
const RAIL_ICON = "flex size-10 items-center justify-center rounded-xl text-muted-foreground";
const ROUND = "relative flex size-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-card";
const WINYU_MARK = "flex shrink-0 items-center justify-center rounded-full bg-linear-135 from-primary via-brand-violet to-brand-coral text-white";
const PRIMARY = "inline-flex shrink-0 items-center justify-center rounded-full bg-ink font-medium text-ink-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const QUIET = "inline-flex shrink-0 items-center justify-center rounded-full font-medium text-foreground ring-1 ring-border transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type Shell = { viewer: Person; bell: number; sharedDot: boolean };

/** The person's photo, or Winyu's mark when the item came from Winyu itself. */
export function Face({ person, className }: { person: Person | null; className: string }) {
  if (!person) {
    return (
      <span className={cn(WINYU_MARK, className)}>
        <BrandMark className="size-[60%]" />
      </span>
    );
  }
  return <Portrait name={person.name} src={person.photo} className={cn("text-xs", className)} />;
}

export function PrimaryButton({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <button type="button" className={cn(PRIMARY, "px-3 py-1 text-xs", className)}>
      {children}
    </button>
  );
}

export function QuietButton({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <button type="button" className={cn(QUIET, "px-3 py-1 text-xs", className)}>
      {children}
    </button>
  );
}

export function UnreadDot({ read, className }: { read: boolean; className?: string }) {
  if (read) return null;
  return <span aria-label={COPY.unread} className={cn("size-2 shrink-0 rounded-full bg-primary", className)} />;
}

export function When({ item, className }: { item: NotifyItem; className?: string }) {
  return <time dateTime={item.at} className={cn("shrink-0 text-[11px] tabular-nums text-muted-foreground", className)}>{relativeTimeTh(item.at)}</time>;
}

export function BellButton({ count, pressed = false }: { count: number; pressed?: boolean }) {
  return (
    <span aria-label={COPY.rail.bell} className={cn(ROUND, pressed && "border-primary/40 text-foreground ring-4 ring-primary/10")}>
      <Bell className="size-4" aria-hidden />
      {count > 0 ? <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-semibold tabular-nums text-ink-foreground ring-2 ring-background">{count}</span> : null}
    </span>
  );
}

function SharedIcon({ dot, active }: { dot: boolean; active: boolean }) {
  return (
    <span aria-label={COPY.rail.shared} className={cn(RAIL_ICON, "relative", active && "bg-bubble text-foreground")}>
      <Share2 className="size-5" aria-hidden />
      {dot ? <span className="absolute right-2 top-2 size-2 rounded-full bg-primary ring-2 ring-card" /> : null}
    </span>
  );
}

function MiniRail({ sharedDot, on }: { sharedDot: boolean; on: "home" | "shared" }) {
  return (
    <aside className="absolute inset-y-0 left-0 flex w-14 flex-col items-center gap-1 border-r border-border bg-card py-3">
      <span className={cn(WINYU_MARK, "mb-1 size-8 rounded-[10px]")}>
        <BrandMark className="size-5" />
      </span>
      <span aria-label={COPY.rail.newChat} className={RAIL_ICON}>
        <MessageSquarePlus className="size-5" aria-hidden />
      </span>
      <span aria-label={COPY.rail.dashboard} className={RAIL_ICON}>
        <LayoutDashboard className="size-5" aria-hidden />
      </span>
      <span aria-label={COPY.rail.inbox} className={RAIL_ICON}>
        <Inbox className="size-5" aria-hidden />
      </span>
      <SharedIcon dot={sharedDot} active={on === "shared"} />
    </aside>
  );
}

function TopRight({ shell, bellPressed }: { shell: Shell; bellPressed: boolean }) {
  return (
    <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
      <BellButton count={shell.bell} pressed={bellPressed} />
      <Face person={shell.viewer} className="size-9 ring-2 ring-card shadow-card" />
    </div>
  );
}

/** The landing behind every surface: a greeting and the composer, kept faint so the notification reads first. */
export function Landing({ viewer, compact = false, children }: { viewer: Person; compact?: boolean; children?: ReactNode }) {
  return (
    <div className={cn("flex h-full flex-col", compact ? "px-4 pb-4 pt-16" : "px-6 pb-5 pt-20")}>
      <h3 className={cn("font-display font-semibold tracking-tight", compact ? "text-xl" : "text-[22px]")}>{COPY.greeting(shortName(viewer.name))}</h3>
      {children}
      <div className="mt-auto flex items-center gap-2 rounded-[22px] border border-border bg-card py-2 pl-4 pr-2 shadow-card">
        <span className="flex-1 truncate text-sm text-muted-foreground">{COPY.composer}</span>
        <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ArrowUp className="size-4" aria-hidden />
        </span>
      </div>
    </div>
  );
}

type FrameProps = { label: string; shell: Shell; mobile?: boolean; on?: "home" | "shared"; bellPressed?: boolean; overlay?: ReactNode; children: ReactNode };

/** One moment at real size: the rail (or the mobile menu), the bell and the person, the page, and whatever floats over it. */
export function Frame({ label, shell, mobile = false, on = "home", bellPressed = false, overlay, children }: FrameProps) {
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-xs font-medium text-muted-foreground">{label}</figcaption>
      <div className={cn("relative overflow-hidden rounded-[22px] border border-border bg-background shadow-card", mobile ? "h-[46rem] w-full max-w-[390px] self-center" : "h-[31rem] w-full")}>
        {mobile ? (
          <span aria-label={COPY.rail.menu} className={cn(ROUND, "absolute left-3 top-3 z-10")}>
            <Menu className="size-4" aria-hidden />
            {shell.sharedDot ? <span className="absolute right-0.5 top-0.5 size-2 rounded-full bg-primary ring-2 ring-card" /> : null}
          </span>
        ) : (
          <MiniRail sharedDot={shell.sharedDot} on={on} />
        )}
        <TopRight shell={shell} bellPressed={bellPressed} />
        <div className={cn("h-full", mobile ? "" : "pl-14")}>{children}</div>
        {overlay}
      </div>
    </figure>
  );
}
