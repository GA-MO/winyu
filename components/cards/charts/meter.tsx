"use client";

type MeterProps = { value: number; detail: string };

/** How far a single level has come to a full bar, under the headline that already states the number. */
export function Meter({ value, detail }: MeterProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
        <div className="h-full rounded-full bg-gradient-to-r from-primary to-brand-violet" style={{ width: `${value}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
