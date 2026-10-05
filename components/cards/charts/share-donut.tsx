"use client";

import type { ShareSlice } from "@/lib/cards/present";
import { TH } from "@/lib/i18n/th";
import { arcPath, sliceColor } from "./chart-kit";

const SIZE = 140;
const CENTER = SIZE / 2;
const R_OUTER = SIZE / 2 - 4;
const R_INNER = R_OUTER * 0.6;

type ShareDonutProps = { slices: ShareSlice[]; centerValue: string; centerLabel: string };

/** A donut ring for parts of a whole, with the leader's number in the middle and every slice named beside it. */
export function ShareDonut({ slices, centerValue, centerLabel }: ShareDonutProps) {
  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.share), 0) || 1;
  let angle = 0;
  const arcs = slices.map((slice, index) => {
    const a0 = angle;
    angle += (Math.max(0, slice.share) / total) * Math.PI * 2;
    return { slice, index, d: arcPath(CENTER, CENTER, R_OUTER, R_INNER, a0, angle) };
  });

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label={TH.chart.donut}>
          {arcs.map((arc) => (
            <path
              key={`${arc.slice.label}-${arc.index}`}
              d={arc.d}
              fill={sliceColor(arc.slice.isOther, arc.index)}
              stroke="var(--card)"
              strokeWidth={1.5}
            >
              <title>{`${arc.slice.label}: ${arc.slice.valueText} · ${arc.slice.shareText}`}</title>
            </path>
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-lg font-semibold tabular-nums text-foreground">{centerValue}</span>
          <span className="max-w-[80px] truncate text-[10px] text-muted-foreground">{centerLabel}</span>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-1.5 text-xs">
        {slices.map((slice, index) => (
          <li key={`${slice.label}-${index}`} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: sliceColor(slice.isOther, index) }}
            />
            <span className="min-w-0 flex-1 truncate text-foreground/85">{slice.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{slice.shareText}</span>
            <span className="shrink-0 font-medium tabular-nums text-foreground">{slice.valueText}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
