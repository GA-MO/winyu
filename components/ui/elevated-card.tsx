import { cn } from "vexa/lib/utils";

const BASE = "group relative flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-5 transition duration-300 hover:-translate-y-0.5";
const SHADOW = "shadow-[0_18px_50px_-30px_var(--vexa-glow),0_8px_24px_-18px_var(--vexa-glow-violet)] hover:shadow-[0_28px_70px_-32px_var(--vexa-glow),0_12px_32px_-18px_var(--vexa-glow-violet)]";

export function ElevatedCard({
  title,
  description,
  action,
  className,
  children,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className={cn(BASE, SHADOW, className)}>
      {title || action ? (
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h2 className="truncate text-sm font-semibold tracking-tight">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
          </div>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}
