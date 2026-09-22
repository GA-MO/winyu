import { cn } from "vexa/lib/utils";

const BASE = "group relative flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-card transition duration-300 hover:-translate-y-0.5 hover:shadow-lift";

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
    <section className={cn(BASE, className)}>
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
