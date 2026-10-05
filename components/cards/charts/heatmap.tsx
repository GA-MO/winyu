"use client";

import { Fragment } from "react";
import type { ColorScale, HeatCell } from "@/lib/cards/present";
import { LegendCaption, heatCellBackground, heatCellTextClass, heatCellTitle } from "./chart-kit";

type HeatmapProps = {
  rowLabels: string[];
  columnLabels: string[];
  cells: (HeatCell | null)[][];
  scale: ColorScale;
  legend: string;
};

const ROW_LABEL_WIDTH = 120;

function EmptyCell() {
  return (
    <div className="flex h-9 items-center justify-center rounded-md bg-muted/60 text-[11px] text-muted-foreground">—</div>
  );
}

/** A grid of groups × groups (or groups × time), each cell coloured by value or by change, with row labels held in view while the grid scrolls. */
export function Heatmap({ rowLabels, columnLabels, cells, scale, legend }: HeatmapProps) {
  return (
    <div>
      <div className="w-full overflow-x-auto">
        <div
          className="grid min-w-max gap-1"
          style={{ gridTemplateColumns: `${ROW_LABEL_WIDTH}px repeat(${columnLabels.length}, minmax(56px, 1fr))` }}
        >
          <div />
          {columnLabels.map((column) => (
            <div
              key={column}
              title={column}
              className="flex items-end justify-center truncate px-1 pb-1 text-[10px] font-medium text-muted-foreground"
            >
              {column}
            </div>
          ))}
          {rowLabels.map((row, ri) => (
            <Fragment key={row}>
              <div className="sticky left-0 z-10 flex items-center truncate bg-card pr-2 text-xs font-medium text-foreground">
                {row}
              </div>
              {columnLabels.map((column, ci) => {
                const cell = cells[ri]?.[ci] ?? null;
                if (!cell) return <EmptyCell key={`${row}-${column}`} />;
                return (
                  <div
                    key={`${row}-${column}`}
                    title={heatCellTitle(row, column, cell)}
                    style={{ background: heatCellBackground(cell, scale) }}
                    className={`flex h-9 items-center justify-center rounded-md text-[11px] font-medium tabular-nums ${heatCellTextClass(cell, scale)}`}
                  >
                    {cell.text}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
      <LegendCaption text={legend} scale={scale} />
    </div>
  );
}
