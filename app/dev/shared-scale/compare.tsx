"use client";

import { useState, type ReactNode } from "react";
import { Smartphone, Monitor } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { TH } from "@/lib/i18n/th";

const COPY = TH.sharedScale;
const QUIET = "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Column({ title, caption, rows, children, className }: { title: string; caption: string; rows: number; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn("flex min-w-0 flex-col gap-4", className)}>
      <header className="flex flex-col gap-0.5 border-b border-border pb-3">
        <h2 className="flex items-baseline gap-2 font-display text-lg font-semibold tracking-tight">
          {title}
          <span className="text-xs font-normal tabular-nums text-muted-foreground">{COPY.rows(rows)}</span>
        </h2>
        <p className="text-sm text-muted-foreground">{caption}</p>
      </header>
      {children}
    </section>
  );
}

/** Today's page and the new design side by side over one fixture, with a switch that shows the new design alone at phone width. */
export function Compare({ today, next, todayRows, nextRows }: { today: ReactNode; next: ReactNode; todayRows: number; nextRows: number }) {
  const [narrow, setNarrow] = useState(false);
  return (
    <div className="flex flex-col gap-6">
      <button type="button" onClick={() => setNarrow((value) => !value)} aria-pressed={narrow} className={cn(QUIET, "self-start")} data-scale-narrow>
        {narrow ? <Monitor className="size-3.5" aria-hidden /> : <Smartphone className="size-3.5" aria-hidden />}
        {narrow ? COPY.wide : COPY.narrow}
      </button>
      {narrow ? (
        <div className="mx-auto w-[390px] rounded-[2rem] border border-border bg-background px-4 py-6" data-scale-phone>
          <Column title={COPY.next} caption={COPY.nextCaption} rows={nextRows}>
            {next}
          </Column>
        </div>
      ) : (
        <div className="grid items-start gap-10 lg:grid-cols-2">
          <Column title={COPY.today} caption={COPY.todayCaption} rows={todayRows}>
            {today}
          </Column>
          <Column title={COPY.next} caption={COPY.nextCaption} rows={nextRows}>
            {next}
          </Column>
        </div>
      )}
    </div>
  );
}
