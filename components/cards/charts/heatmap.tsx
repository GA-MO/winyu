"use client";

import { Fragment } from "react";
import { cn } from "@/components/ui/cn";
import type { ColorScale, HeatCell } from "@/lib/cards/present";
import { TH } from "@/lib/i18n/th";
import { heatCellTitle } from "./chart-kit";

type HeatmapProps = {
  rowLabels: string[];
  columnLabels: string[];
  cells: (HeatCell | null)[][];
  scale: ColorScale;
  unit: string;
};

const CELL_TONE: Record<HeatCell["tone"], string> = {
  bad: "bg-danger/15 text-danger font-semibold",
  good: "bg-success/15 text-success font-semibold",
  neutral: "bg-primary/15 text-foreground font-semibold",
};

function EmptyCell() {
  return <div className="flex h-9 items-center justify-center rounded-md bg-muted/40 text-[11px] text-muted-foreground">—</div>;
}

/** A grid of groups × groups (or groups × time) that fits the card's width: every cell a bare number on one scale whose unit is named once above the grid, only the cells that stand apart carry colour, and a long column name wraps to two lines with its full name on hover or long-press. */
export function Heatmap({ rowLabels, columnLabels, cells, scale, unit }: HeatmapProps) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-1.5">
      <p className="text-right text-[11px] text-muted-foreground">{scale === "delta" ? TH.cards.heat.changeUnit(unit) : TH.cards.heat.unit(unit)}</p>
      <div className="grid w-full min-w-0 gap-1" style={{ gridTemplateColumns: `minmax(0, 5.5rem) repeat(${columnLabels.length}, minmax(0, 1fr))` }}>
        <div />
        {columnLabels.map((column) => (
          <div key={column} title={column} className="line-clamp-2 flex items-end justify-center break-words px-0.5 pb-1 text-center text-[10px] font-medium leading-tight text-muted-foreground">
            {column}
          </div>
        ))}
        {rowLabels.map((row, ri) => (
          <Fragment key={row}>
            <div title={row} className="flex min-w-0 items-center pr-1 text-[12px] font-medium text-foreground">
              <span className="line-clamp-2 break-words leading-tight">{row}</span>
            </div>
            {columnLabels.map((column, ci) => {
              const cell = cells[ri]?.[ci] ?? null;
              if (!cell) return <EmptyCell key={`${row}-${column}`} />;
              return (
                <div
                  key={`${row}-${column}`}
                  title={heatCellTitle(row, column, cell)}
                  className={cn("flex h-9 min-w-0 items-center justify-center rounded-md text-[11px] tabular-nums", cell.exception ? CELL_TONE[cell.tone] : "bg-muted/50 text-muted-foreground")}
                >
                  <span className="whitespace-nowrap">{cell.text}</span>
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
