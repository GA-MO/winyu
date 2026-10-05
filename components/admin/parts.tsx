import Link from "next/link";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { formatDateTh, formatTimeTh } from "@/lib/i18n/format";

export const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export const FIELD = `h-9 rounded-full border border-border bg-card px-3.5 text-sm text-foreground shadow-card ${FOCUS}`;
export const GHOST = `inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-sm text-muted-foreground shadow-card transition hover:border-foreground/25 hover:text-foreground ${FOCUS}`;
export const INK = `inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-medium text-ink-foreground transition hover:opacity-90 ${FOCUS}`;

/** A native select with its own chevron, so the arrow sits inside the pill's padding instead of on its edge. */
export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={cn("relative inline-flex min-w-0", className)}>
      <select {...props} className={`${FIELD} w-full min-w-0 cursor-pointer appearance-none pr-10`}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
    </span>
  );
}

export type Tone = "neutral" | "success" | "warning" | "danger" | "primary";

const TONE_PILL: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success/12 text-success",
  warning: "bg-warning/14 text-warning",
  danger: "bg-danger/10 text-danger",
  primary: "bg-primary/10 text-primary",
};

const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-muted-foreground/60",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  primary: "bg-primary",
};

export function stamp(iso: string): string {
  return `${formatDateTh(iso)} ${formatTimeTh(iso)}`;
}

export function initialsOf(name: string): string {
  const words = name.replace(/^คุณ/, "").trim().split(/\s+/);
  return words[0]?.slice(0, 1) ?? "";
}

export function Panel({
  title,
  hint,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-3xl border border-border bg-card shadow-card", className)}>
      {title ? (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
            {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
          </div>
          {action}
        </header>
      ) : null}
      <div className={cn("p-5", title ? "pt-4" : "", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone = "neutral", href }: { label: string; value: string; sub?: string; tone?: Tone; href?: string }) {
  const body = (
    <>
      <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className={cn("size-1.5 rounded-full", TONE_DOT[tone])} aria-hidden />
        {label}
      </p>
      <p className="mt-3 font-display text-[2rem] font-semibold leading-none tracking-[-0.03em] tabular-nums">{value}</p>
      {sub ? <p className="mt-2 text-xs text-muted-foreground">{sub}</p> : null}
    </>
  );
  const frame = "group relative min-w-0 rounded-3xl border border-border bg-card p-5 shadow-card transition";
  if (!href) return <div className={frame}>{body}</div>;
  return (
    <Link href={href} className={cn(frame, "hover:-translate-y-0.5 hover:shadow-lift", FOCUS)}>
      {body}
      <ArrowUpRight className="absolute right-4 top-4 size-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" aria-hidden />
    </Link>
  );
}

export function Pill({ tone = "neutral", children, title }: { tone?: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", TONE_PILL[tone])}>
      {children}
    </span>
  );
}

/** A submit button drawn as a switch; the form around it carries what flipping it means. */
export function SwitchButton({ on, label, disabled = false }: { on: boolean; label: string; disabled?: boolean }) {
  return (
    <button
      type="submit"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-40",
        FOCUS,
        on ? "border-transparent bg-success" : "border-muted-foreground/40 bg-muted",
      )}
    >
      <span className={cn("inline-block size-5 rounded-full shadow-card transition", on ? "translate-x-5 bg-card" : "translate-x-0.5 bg-muted-foreground")} />
    </button>
  );
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const box = size === "lg" ? "size-11 text-base" : size === "sm" ? "size-6 text-[10px]" : "size-8 text-xs";
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-bubble font-semibold text-accent-foreground ring-2 ring-card", box)} aria-hidden>
      {initialsOf(name)}
    </span>
  );
}

export function EmptyLine({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">{text}</p>;
}

export function LinkMore({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground", FOCUS)}>
      {children}
      <ArrowUpRight className="size-3.5" aria-hidden />
    </Link>
  );
}

/** A switch that acts on the whole company, drawn as a labelled button so it never reads as one row's toggle. */
export function SystemToggle({ on, onLabel, offLabel }: { on: boolean; onLabel: string; offLabel: string }) {
  return (
    <button
      type="submit"
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition",
        FOCUS,
        on ? "border-danger/40 text-danger hover:bg-danger/10" : "border-transparent bg-primary text-primary-foreground hover:opacity-90",
      )}
    >
      {on ? onLabel : offLabel}
    </button>
  );
}
