"use client";

import type { ChartSeries } from "@/lib/cards/present";
import type { MetricFormat } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";
import {
  AXIS_COLOR,
  AXIS_W,
  CHART_HEIGHT,
  ChartFrame,
  ChartLegend,
  EmptyChart,
  GRID_COLOR,
  SERIES_COLORS,
  clipLabel,
  formatTick,
  niceTicks,
  scaleLinear,
  thinLabels,
  useContainerWidth,
} from "./chart-kit";

const MAX_SERIES = 5;
const STROKE_WIDTH = 1.5;
const FILL_OPACITY = 0.55;

type StackedAreaProps = { labels: string[]; series: ChartSeries[]; format: MetricFormat };

function bandTop(series: ChartSeries[], upTo: number, index: number): number {
  let sum = 0;
  for (let s = 0; s <= upTo; s += 1) sum += Math.max(0, series[s]?.values[index] ?? 0);
  return sum;
}

function pathOf(points: { x: number; y: number }[]): string {
  return points.map((point, i) => `${i === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

/** Composition over time Vexa's LineChart cannot draw: bands stacked bottom-up, each series a translucent fill under its own stroke. */
export function StackedArea({ labels, series, format }: StackedAreaProps) {
  const [ref, width] = useContainerWidth();
  const n = labels.length;
  const capped = series.slice(0, MAX_SERIES);
  if (n === 0 || capped.length === 0) {
    return (
      <ChartFrame>
        <EmptyChart />
      </ChartFrame>
    );
  }
  const height = CHART_HEIGHT.md;
  const plotH = height - 24;
  const totals = labels.map((_, i) => bandTop(capped, capped.length - 1, i));
  const ticks = niceTicks(Math.max(...totals, 0));
  const top = ticks[ticks.length - 1] ?? 0;
  const x = scaleLinear(0, Math.max(1, n - 1), AXIS_W + 4, width - 8);
  const y = scaleLinear(0, top, plotH, 6);
  const shown = thinLabels(n, Math.max(2, Math.min(12, Math.floor((width - AXIS_W) / 56))));
  const labelBudget = (width - AXIS_W) / Math.max(1, shown.size);

  return (
    <ChartFrame>
      <div ref={ref} className="flex w-full flex-col gap-1.5">
        <ChartLegend items={capped.map((s, i) => ({ name: s.name, color: SERIES_COLORS[i % SERIES_COLORS.length] }))} />
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label={TH.chart.stackedArea}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={AXIS_W} x2={width - 4} y1={y(t)} y2={y(t)} stroke={GRID_COLOR} />
              <text x={AXIS_W - 6} y={y(t)} fontSize={10} fill={AXIS_COLOR} textAnchor="end" dominantBaseline="middle">
                {formatTick(t, format)}
              </text>
            </g>
          ))}
          {capped.map((series, si) => {
            const color = SERIES_COLORS[si % SERIES_COLORS.length];
            const topPoints = labels.map((_, i) => ({ x: x(i), y: y(bandTop(capped, si, i)) }));
            const basePoints = labels.map((_, i) => ({ x: x(i), y: y(si === 0 ? 0 : bandTop(capped, si - 1, i)) }));
            const areaPath = `${pathOf(topPoints)} ${pathOf([...basePoints].reverse())
              .replace("M", "L")} Z`;
            return (
              <g key={series.name}>
                <path d={areaPath} fill={color} fillOpacity={FILL_OPACITY} stroke="none" />
                <path d={pathOf(topPoints)} fill="none" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinejoin="round" strokeLinecap="round" />
              </g>
            );
          })}
          {labels.map((label, i) =>
            shown.has(i) ? (
              <text key={i} x={x(i)} y={height - 6} fontSize={10} fill={AXIS_COLOR} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>
                {clipLabel(label, labelBudget)}
              </text>
            ) : null,
          )}
        </svg>
      </div>
    </ChartFrame>
  );
}
