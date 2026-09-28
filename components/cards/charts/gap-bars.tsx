"use client";

import type { GapEnds, GapRow } from "@/lib/cards/present";
import type { Tone } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";

type GapBarsProps = { rows: GapRow[]; ends: GapEnds; caption: string | null; shownOf: string | null };

const MIN_BAR_PCT = 1.5;
const HALF = 50;

function toneBarClass(tone: Tone): string {
  if (tone === "good") return "bg-success";
  if (tone === "bad") return "bg-danger";
  return "bg-muted-foreground/45";
}

function toneValueClass(tone: Tone): string {
  if (tone === "good") return "text-success";
  if (tone === "bad") return "text-danger";
  return "text-foreground";
}

function barStyle(gap: number): { left?: string; right?: string; width: string } {
  const width = `${Math.max(MIN_BAR_PCT, Math.min(1, Math.abs(gap)) * HALF)}%`;
  return gap < 0 ? { right: `${HALF}%`, width } : { left: `${HALF}%`, width };
}

/** Each row's distance from a line — a change from zero, a level from its target, a second measure from the first: bars grow left for less and right for more from the centre line. */
export function GapBars({ rows, ends, caption, shownOf }: GapBarsProps) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-2.5">
      <div className="flex justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{ends.less}</span>
        <span className="text-end">{ends.more}</span>
      </div>
      <ol className="flex w-full min-w-0 flex-col gap-2.5" aria-label={TH.chart.gap}>
        {rows.map((row) => (
          <li key={row.label} className="min-w-0">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-[13px] text-foreground" title={row.label}>
                {row.label}
              </span>
              {row.detail ? <span className="max-w-[45%] shrink-0 truncate text-[11px] tabular-nums text-muted-foreground" title={row.detail}>{row.detail}</span> : null}
              <span className={`shrink-0 text-[13px] font-semibold tabular-nums ${toneValueClass(row.tone)}`}>{row.gapText}</span>
            </div>
            <div className="relative mt-1.5 h-1 w-full rounded-full bg-muted">
              <div className="absolute -inset-y-1 left-1/2 w-px bg-foreground/30" />
              <div className={`absolute inset-y-0 rounded-full ${toneBarClass(row.tone)}`} style={barStyle(row.gap)} />
            </div>
          </li>
        ))}
      </ol>
      {caption ? <p className="text-[11px] text-muted-foreground/80">{caption}</p> : null}
      {shownOf ? <p className="text-[11px] text-muted-foreground/80">{shownOf}</p> : null}
    </div>
  );
}
