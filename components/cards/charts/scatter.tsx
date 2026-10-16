"use client";

import type { ScatterAxis, ScatterPoint } from "@/lib/cards/present";
import { TH } from "@/lib/i18n/th";
import { AXIS_COLOR, ChartFrame, EmptyChart, GRID_COLOR, clipLabel, formatTick, niceRange, scaleLinear, useContainerWidth } from "./chart-kit";

type ScatterProps = { points: ScatterPoint[]; x: ScatterAxis; y: ScatterAxis };

const HEIGHT = 240;
const PLOT_TOP = 22;
const PLOT_BOTTOM = 38;
const MIN_PLOT_LEFT = 40;
const MAX_PLOT_LEFT = 96;
const TICK_CHAR_PX = 5.6;
const PLOT_RIGHT = 12;
const TICK_COUNT = 2;
const LABEL_MAX_PX = 124;
const LABEL_CHAR_PX = 5.8;
const LABEL_H = 12;
const LABEL_OFFSET = 7;
const LABEL_BASELINE = 3;
const DOT_R = 4;
const MUTED_DOT_OPACITY = 0.45;
const MEDIAN_STROKE = "var(--muted-foreground)";

type Box = { left: number; right: number; top: number; bottom: number };
type Placed = { x: number; y: number; anchor: "start" | "end"; box: Box };

function plotLeftFor(labels: string[]): number {
  const longest = Math.max(0, ...labels.map((label) => label.length));
  return Math.min(MAX_PLOT_LEFT, Math.max(MIN_PLOT_LEFT, Math.ceil(longest * TICK_CHAR_PX) + 10));
}

function domainOf(values: number[]): [number, number] {
  return [Math.min(0, ...values), Math.max(0, ...values)];
}

function overlaps(left: Box, right: Box): boolean {
  return left.left < right.right && right.left < left.right && left.top < right.bottom && right.top < left.bottom;
}

function candidate(cx: number, cy: number, width: number, right: boolean, above: boolean): Placed {
  const x = right ? cx + LABEL_OFFSET : cx - LABEL_OFFSET;
  const y = above ? cy - LABEL_OFFSET + LABEL_BASELINE : cy + LABEL_OFFSET + LABEL_H - LABEL_BASELINE;
  return { x, y, anchor: right ? "start" : "end", box: { left: right ? x : x - width, right: right ? x + width : x, top: y - LABEL_H, bottom: y } };
}

/** Where a point's name fits: right or left of the dot, above or below, inside the plot, clear of every other name and every other named dot (the muted dots may sit under it); null when nowhere fits. */
function placeLabel(text: string, cx: number, cy: number, dots: Box[], placed: Placed[], bounds: Box): Placed | null {
  const width = Math.min(LABEL_MAX_PX, text.length * LABEL_CHAR_PX);
  const spots = [candidate(cx, cy, width, true, true), candidate(cx, cy, width, false, true), candidate(cx, cy, width, true, false), candidate(cx, cy, width, false, false)];
  const inside = (box: Box) => box.left >= bounds.left && box.right <= bounds.right && box.top >= bounds.top && box.bottom <= bounds.bottom;
  return spots.find((spot) => inside(spot.box) && !dots.some((dot) => overlaps(dot, spot.box)) && !placed.some((label) => overlaps(label.box, spot.box))) ?? null;
}

/** Two metrics of the same things against each other: medians split the plot, the few points that answer the question are named and coloured, the rest stay muted. */
export function Scatter({ points, x, y }: ScatterProps) {
  const [ref, width] = useContainerWidth();
  if (points.length === 0) {
    return (
      <ChartFrame>
        <EmptyChart />
      </ChartFrame>
    );
  }
  const [xRawMin, xRawMax] = domainOf(points.map((point) => point.x));
  const [yRawMin, yRawMax] = domainOf(points.map((point) => point.y));
  const xTicks = niceRange(xRawMin, xRawMax, TICK_COUNT);
  const yTicks = niceRange(yRawMin, yRawMax, TICK_COUNT);
  const xMin = xTicks[0] ?? 0;
  const xMax = xTicks[xTicks.length - 1] ?? 1;
  const yMin = yTicks[0] ?? 0;
  const yMax = yTicks[yTicks.length - 1] ?? 1;
  const plotLeft = plotLeftFor(yTicks.map((t) => formatTick(t, y.format)));
  const plotH = HEIGHT - PLOT_TOP - PLOT_BOTTOM;
  const plotBottom = PLOT_TOP + plotH;
  const xScale = scaleLinear(xMin, xMax, plotLeft, width - PLOT_RIGHT);
  const yScale = scaleLinear(yMin, yMax, plotBottom, PLOT_TOP);
  const centres = points.map((point) => ({ cx: xScale(point.x), cy: yScale(point.y) }));
  const bounds: Box = { left: plotLeft, right: width - PLOT_RIGHT, top: PLOT_TOP - LABEL_H, bottom: plotBottom };
  const placed: Placed[] = [];
  const labels = new Map<number, Placed>();
  points.forEach((point, index) => {
    if (!point.named) return;
    const dots = centres.filter((_, other) => other !== index && points[other].named).map(({ cx, cy }) => ({ left: cx - DOT_R, right: cx + DOT_R, top: cy - DOT_R, bottom: cy + DOT_R }));
    const spot = placeLabel(clipLabel(point.label, LABEL_MAX_PX), centres[index].cx, centres[index].cy, dots, placed, bounds);
    if (!spot) return;
    placed.push(spot);
    labels.set(index, spot);
  });

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
          <line x1={xScale(x.median)} x2={xScale(x.median)} y1={PLOT_TOP} y2={plotBottom} stroke={MEDIAN_STROKE} strokeOpacity={0.35} strokeDasharray="4 3" />
          <line x1={plotLeft} x2={width - PLOT_RIGHT} y1={yScale(y.median)} y2={yScale(y.median)} stroke={MEDIAN_STROKE} strokeOpacity={0.35} strokeDasharray="4 3" />
          {points.map((point, index) => {
            const { cx, cy } = centres[index];
            const label = labels.get(index);
            return (
              <g key={`${point.label}-${index}`}>
                <circle cx={cx} cy={cy} r={DOT_R} fill={point.named ? "var(--chart-1)" : "var(--muted-foreground)"} fillOpacity={point.named ? 1 : MUTED_DOT_OPACITY}>
                  <title>{`${point.label}: ${point.xText} · ${point.yText}`}</title>
                </circle>
                {label ? (
                  <text x={label.x} y={label.y} fontSize={10} fill="var(--foreground)" stroke="var(--card)" strokeWidth={3} paintOrder="stroke" textAnchor={label.anchor}>
                    {clipLabel(point.label, LABEL_MAX_PX)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </ChartFrame>
  );
}
