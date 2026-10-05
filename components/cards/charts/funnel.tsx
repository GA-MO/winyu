"use client";

import type { FunnelStage } from "@/lib/cards/present";
import { toneTextClass } from "./chart-kit";

type FunnelProps = { stages: FunnelStage[] };

const MIN_WIDTH_PCT = 12;
const FADE_STEP = 0.14;
const MIN_OPACITY = 0.45;

function barOpacity(index: number): number {
  return Math.max(MIN_OPACITY, 1 - index * FADE_STEP);
}

/** Stages of one flow in the same unit, each bar sized against the first stage, with what was lost between stages named underneath. */
export function Funnel({ stages }: FunnelProps) {
  return (
    <div className="flex flex-col">
      {stages.map((stage, index) => (
        <div key={stage.label} className="flex flex-col">
          {index > 0 ? (
            <div className="flex items-center justify-center py-1">
              <span className={`text-[11px] font-medium ${stage.dropText ? toneTextClass(stage.dropTone) : "text-muted-foreground"}`}>
                {stage.dropText}
              </span>
            </div>
          ) : null}
          <div className="flex items-center gap-3">
            <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">{stage.label}</span>
            <div className="h-7 min-w-0 flex-1 rounded-md bg-muted/50">
              <div
                className="flex h-7 items-center justify-end rounded-md px-2"
                style={{ width: `${Math.max(MIN_WIDTH_PCT, stage.width * 100)}%`, background: "var(--chart-1)", opacity: barOpacity(index) }}
              >
                <span className="truncate text-[11px] font-medium tabular-nums text-primary-foreground">{stage.valueText}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
