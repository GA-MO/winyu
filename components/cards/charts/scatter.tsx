"use client";

import type { ScatterAxis, ScatterPoint } from "@/lib/cards/present";
import { TH } from "@/lib/i18n/th";
import { AXIS_COLOR, ChartFrame, EmptyChart, GRID_COLOR, clipLabel, formatTick, niceRange, scaleLinear, useContainerWidth } from "./chart-kit";

type ScatterProps = { points: ScatterPoint[]; x: ScatterAxis; y: ScatterAxis; note: string | null; diagonal: string | null };

const HEIGHT = 256;
const PLOT_TOP = 22;
const PLOT_BOTTOM = 38;
const MIN_PLOT_LEFT = 40;
const MAX_PLOT_LEFT = 96;
const TICK_CHAR_PX = 5.6;
const PLOT_RIGHT = 12;
const LABEL_CLEARANCE_X = 70;
const LABEL_CLEARANCE_Y = 12;
const LABEL_MAX_PX = 84;
const LABEL_FLIP_SHARE = 0.7;
const DOT_R = 4;
const MEDIAN_STROKE = "var(--muted-foreground)";

type PlacedLabel = { x: number; y: number };

function plotLeftFor(labels: string[]): number {
  const longest = Math.max(0, ...labels.map((label) => label.length));
  return Math.min(MAX_PLOT_LEFT, Math.max(MIN_PLOT_LEFT, Math.ceil(longest * TICK_CHAR_PX) + 10));
}

function collides(placed: PlacedLabel[], x: number, y: number): boolean {
  return placed.some((label) => Math.abs(label.x - x) < LABEL_CLEARANCE_X && Math.abs(label.y - y) < LABEL_CLEARANCE_Y);
}

function domainOf(values: number[]): [number, number] {
  return [Math.min(0, ...values), Math.max(0, ...values)];
}

/** Two metrics of the same things against each other: medians split the plot, outliers are named, and — when the units match — a y = x line shows who is ahead. */
export function Scatter({ points, x, y, note, diagonal }: ScatterProps) {
  const [ref, width] = useContainerWidth();
  if (points.length === 0) {
    return (
      <ChartFrame>
        <EmptyChart />
      </ChartFrame>
    );
  }
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const shareAxes = diagonal !== null;
  const [sharedMin, sharedMax] = domainOf([...xs, ...ys]);
  const [xRawMin, xRawMax] = shareAxes ? [sharedMin, sharedMax] : domainOf(xs);
  const [yRawMin, yRawMax] = shareAxes ? [sharedMin, sharedMax] : domainOf(ys);
  const xTicks = niceRange(xRawMin, xRawMax);
  const yTicks = niceRange(yRawMin, yRawMax);
  const xMin = xTicks[0] ?? 0;
  const xMax = xTicks[xTicks.length - 1] ?? 1;
  const yMin = yTicks[0] ?? 0;
  const yMax = yTicks[yTicks.length - 1] ?? 1;
  const plotLeft = plotLeftFor(yTicks.map((t) => formatTick(t, y.format)));
  const plotH = HEIGHT - PLOT_TOP - PLOT_BOTTOM;
  const plotBottom = PLOT_TOP + plotH;
  const xScale = scaleLinear(xMin, xMax, plotLeft, width - PLOT_RIGHT);
  const placed: PlacedLabel[] = [];
  const yScale = scaleLinear(yMin, yMax, PLOT_TOP + plotH, PLOT_TOP);

  return (
    <ChartFrame>
      <div ref={ref} className="flex w-full flex-col gap-1">
        <svg viewBox={`0 0 ${width} ${HEIGHT}`} width="100%" height={HEIGHT} role="img" aria-label={TH.chart.scatter}>
          <text x={plotLeft} y={12} fontSize={10} fill={AXIS_COLOR}>
            {y.label}
          </text>
          {yTicks.map((t) => (
            <g key={`y-${t}`}>
              <line x1={plotLeft} x2={width - PLOT_RIGHT} y1={yScale(t)} y2={yScale(t)} stroke={GRID_COLOR} />
              <text x={plotLeft - 6} y={yScale(t)} fontSize={10} fill={AXIS_COLOR} textAnchor="end" dominantBaseline="middle">
                {formatTick(t, y.format)}
              </text>
            </g>
          ))}
          {xTicks.map((t, index) => (
            <text key={`x-${t}`} x={xScale(t)} y={plotBottom + 14} fontSize={10} fill={AXIS_COLOR} textAnchor={index === 0 ? "start" : index === xTicks.length - 1 ? "end" : "middle"}>
              {formatTick(t, x.format)}
            </text>
          ))}
          <text x={width - PLOT_RIGHT} y={HEIGHT - 4} fontSize={10} fill={AXIS_COLOR} textAnchor="end">
            {x.label}
          </text>
          {shareAxes ? (
            <line
              x1={xScale(xMin)}
              y1={yScale(xMin)}
              x2={xScale(xMax)}
              y2={yScale(xMax)}
              stroke={MEDIAN_STROKE}
              strokeOpacity={0.35}
              strokeDasharray="2 3"
            />
          ) : null}
          <line x1={xScale(x.median)} x2={xScale(x.median)} y1={PLOT_TOP} y2={PLOT_TOP + plotH} stroke={MEDIAN_STROKE} strokeOpacity={0.4} strokeDasharray="4 3" />
          <text x={xScale(x.median) + 3} y={PLOT_TOP + 9} fontSize={9} fill={AXIS_COLOR}>
            {TH.chart.median}
          </text>
          <line x1={plotLeft} x2={width - PLOT_RIGHT} y1={yScale(y.median)} y2={yScale(y.median)} stroke={MEDIAN_STROKE} strokeOpacity={0.4} strokeDasharray="4 3" />
          <text x={width - PLOT_RIGHT - 3} y={yScale(y.median) - 3} fontSize={9} fill={AXIS_COLOR} textAnchor="end">
            {TH.chart.median}
          </text>
          {points.map((point, index) => {
            const cx = xScale(point.x);
            const cy = yScale(point.y);
            const flip = cx > width * LABEL_FLIP_SHARE;
            const labelX = flip ? cx - 6 : cx + 6;
            const labelY = cy - 6;
            const showLabel = point.named && !collides(placed, labelX, labelY);
            if (showLabel) placed.push({ x: labelX, y: labelY });
            return (
              <g key={`${point.label}-${index}`}>
                <circle cx={cx} cy={cy} r={DOT_R} fill="var(--chart-1)">
                  <title>{`${point.label}: ${point.xText} · ${point.yText}`}</title>
                </circle>
                {showLabel ? (
                  <text x={labelX} y={labelY} fontSize={10} fill="var(--foreground)" textAnchor={flip ? "end" : "start"}>
                    {clipLabel(point.label, LABEL_MAX_PX)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
        {diagonal ? <p className="text-xs text-muted-foreground">{diagonal}</p> : null}
      </div>
    </ChartFrame>
  );
}
