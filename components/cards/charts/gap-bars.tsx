"use client";

import type { GapRow } from "@/lib/cards/present";
import type { Tone } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";
import { toneTextClass } from "./chart-kit";

type GapBarsProps = { rows: GapRow[]; caption: string; shownOf: string | null };

const MIN_BAR_PCT = 1.5;
const HALF = 50;

function toneBarClass(tone: Tone): string {
  if (tone === "good") return "bg-success";
  if (tone === "bad") return "bg-danger";
  return "bg-muted-foreground/50";
}

function barStyle(gap: number): { left?: string; right?: string; width: string } {
  const width = `${Math.max(MIN_BAR_PCT, Math.abs(gap) * HALF)}%`;
  return gap < 0 ? { right: `${HALF}%`, width } : { left: `${HALF}%`, width };
}

/** How far a second measure of each thing sits from the first: bars grow left for less, right for more, from a centre line at parity. */
export function GapBars({ rows, caption, shownOf }: GapBarsProps) {
  return (
    <div className="flex flex-col gap-2" role="list" aria-label={TH.chart.gap}>
      <div className="grid grid-cols-[minmax(0,11rem)_1fr_3.5rem] gap-x-3 text-[11px] text-muted-foreground">
        <span />
        <div className="flex justify-between gap-2">
          <span>{TH.dash.gapLess}</span>
          <span className="text-end">{TH.dash.gapMore}</span>
        </div>
        <span />
      </div>
      {rows.map((row) => (
        <div key={row.label} role="listitem" className="grid grid-cols-[minmax(0,11rem)_1fr_3.5rem] items-center gap-x-3">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm text-foreground" title={row.label}>
              {row.label}
            </span>
            <span className="truncate text-[11px] tabular-nums text-muted-foreground" title={row.detail}>
              {row.detail}
            </span>
          </div>
          <div className="relative h-3 rounded-sm bg-muted/50">
            <div className="absolute inset-y-[-3px] left-1/2 w-px bg-border" />
            <div className={`absolute inset-y-0 rounded-sm ${toneBarClass(row.tone)}`} style={barStyle(row.gap)} />
          </div>
          <span className={`text-end text-sm font-medium tabular-nums ${toneTextClass(row.tone)}`}>{row.gapText}</span>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">{caption}</p>
      {shownOf ? <p className="text-xs text-muted-foreground">{shownOf}</p> : null}
    </div>
  );
}
