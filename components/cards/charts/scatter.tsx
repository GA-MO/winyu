"use client";

import type { ScatterAxis, ScatterPoint } from "@/lib/cards/present";
import { spacedTicks, type AxisTick } from "@/components/ui/charts";
import { TH } from "@/lib/i18n/th";
import { formatNumber } from "@/lib/i18n/format";
import { AXIS_COLOR, ChartFrame, EmptyChart, GRID_COLOR, clipLabel, niceRange, scaleLinear, useContainerWidth } from "./chart-kit";

type ScatterProps = { points: ScatterPoint[]; x: ScatterAxis; y: ScatterAxis };

const HEIGHT = 240;
const PLOT_TOP = 22;
const PLOT_BOTTOM = 38;
const MIN_PLOT_LEFT = 40;
const MAX_PLOT_LEFT = 96;
const TICK_CHAR_PX = 5.6;
const PLOT_RIGHT = 12;
const TICK_COUNTS = [4, 5, 6] as const;
const LABEL_MAX_PX = 124;
const LABEL_CHAR_PX = 5.6;
const LABEL_ASCENT = 11;
const LABEL_DESCENT = 4;
const THAI_MARKS = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g;
const LABEL_OFFSETS = [7, 16, 28, 40] as const;
const LEADER_FROM_OFFSET = 16;
const MAX_REORDERED = 6;
const UNPLACED_COST = 1000;
const LEADER_COST = 0.5;
const LABEL_BASELINE = 3;
const DOT_R = 4;
const MUTED_DOT_OPACITY = 0.45;
const MEDIAN_STROKE = "var(--muted-foreground)";

type Box = { left: number; right: number; top: number; bottom: number };
type Side = "right" | "left" | "over";
type Anchor = "start" | "end";
type Leader = { x1: number; y1: number; x2: number; y2: number };
type Placed = { x: number; y: number; anchor: Anchor; box: Box; leader: Leader | null; covers: number };

function plotLeftFor(labels: string[]): number {
  const longest = Math.max(0, ...labels.map((label) => label.length));
  return Math.min(MAX_PLOT_LEFT, Math.max(MIN_PLOT_LEFT, Math.ceil(longest * TICK_CHAR_PX) + 10));
}

function domainOf(values: number[]): [number, number] {
  return [Math.min(0, ...values), Math.max(0, ...values)];
}

/** Round ticks whose ends sit closest to the data (205 ล้าน ends at 250, not 400), so the points spread over the plot; on a tie the fewer ticks win. */
export function fittedTicks(min: number, max: number): number[] {
  const overshoot = (ticks: number[]) => (ticks[ticks.length - 1] ?? max) - max + (min - (ticks[0] ?? min));
  return TICK_COUNTS.map((count) => niceRange(min, max, count)).reduce((best, ticks) => (overshoot(ticks) < overshoot(best) ? ticks : best));
}

function tickText(value: number, axis: ScatterAxis): string {
  return formatNumber(value / axis.divisor);
}

/** The x ticks that get a label: every one when they fit, else every second or fifth one so the labelled steps stay even and both ends stay ("0 100 200", never "0 50 150 250"). */
export function evenTickLabels<T extends AxisTick>(ticks: readonly T[]): T[] {
  const last = ticks.length - 1;
  for (let step = 1; step < last; step += 1) {
    if (last % step !== 0) continue;
    const subset = ticks.filter((_, index) => index % step === 0);
    if (spacedTicks(subset).length === subset.length) return subset;
  }
  return last > 0 ? [ticks[0], ticks[last]] : [...ticks];
}

function overlaps(left: Box, right: Box): boolean {
  return left.left < right.right && right.left < left.right && left.top < right.bottom && right.top < left.bottom;
}

/** How wide a name draws: Thai vowel and tone marks sit above or below the letter before them and take no width. */
function labelWidth(text: string): number {
  return Math.min(LABEL_MAX_PX, text.replace(THAI_MARKS, "").length * LABEL_CHAR_PX);
}

function candidate(cx: number, cy: number, width: number, side: Side, above: boolean, offset: number, bounds: Box): Placed {
  const y = above ? cy - offset + LABEL_BASELINE : cy + offset + LABEL_ASCENT - LABEL_BASELINE;
  const left = side === "right" ? cx + LABEL_OFFSETS[0] : side === "left" ? cx - LABEL_OFFSETS[0] - width : Math.min(bounds.right - width, Math.max(bounds.left, cx - width / 2));
  const box = { left, right: left + width, top: y - LABEL_ASCENT, bottom: y + LABEL_DESCENT };
  const leader = offset >= LEADER_FROM_OFFSET ? { x1: cx, y1: above ? cy - DOT_R : cy + DOT_R, x2: Math.min(box.right, Math.max(box.left, cx)), y2: above ? box.bottom : box.top } : null;
  return side === "left" ? { x: box.right, y, anchor: "end", box, leader, covers: 0 } : { x: left, y, anchor: "start", box, leader, covers: 0 };
}

function leaderBox({ x1, y1, x2, y2 }: Leader): Box {
  return { left: Math.min(x1, x2) - 1, right: Math.max(x1, x2) + 1, top: Math.min(y1, y2), bottom: Math.max(y1, y2) };
}

/** Where a point's name fits: beside the dot, or further up or down with a thin leader to it, inside the plot and clear of every other name and leader; the nearest spot clear of every dot when one exists, else the one over the fewest muted dots (never a named one); null when nowhere fits. */
function placeLabel(text: string, cx: number, cy: number, dots: { all: Box[]; named: Box[] }, placed: Placed[], bounds: Box): Placed | null {
  const width = labelWidth(text);
  const sidesAt = (offset: number): Side[] => (offset === LABEL_OFFSETS[0] ? ["right", "left"] : ["right", "left", "over"]);
  const spots = LABEL_OFFSETS.flatMap((offset) => [true, false].flatMap((above) => sidesAt(offset).map((side) => candidate(cx, cy, width, side, above, offset, bounds))));
  const inside = (box: Box) => box.left >= bounds.left && box.right <= bounds.right && box.top >= bounds.top && box.bottom <= bounds.bottom;
  const takes = (spot: Placed): Box[] => (spot.leader ? [spot.box, leaderBox(spot.leader)] : [spot.box]);
  const taken = placed.flatMap(takes);
  const open = spots.filter((spot) => inside(spot.box) && !dots.named.some((dot) => overlaps(dot, spot.box)) && !takes(spot).some((part) => taken.some((other) => overlaps(other, part))));
  const covered = (spot: Placed) => dots.all.filter((dot) => overlaps(dot, spot.box)).length;
  const best = open.reduce<Placed | null>((chosen, spot) => (chosen === null || covered(spot) < covered(chosen) ? spot : chosen), null);
  return best && { ...best, covers: covered(best) };
}

function orderings(items: number[]): number[][] {
  if (items.length <= 1 || items.length > MAX_REORDERED) return [items];
  return items.flatMap((item, at) => orderings([...items.slice(0, at), ...items.slice(at + 1)]).map((rest) => [item, ...rest]));
}

function dotBox({ cx, cy }: { cx: number; cy: number }): Box {
  return { left: cx - DOT_R, right: cx + DOT_R, top: cy - DOT_R, bottom: cy + DOT_R };
}

/** The named points' labels, placed in the order that leaves the fewest names out, the fewest muted dots under a name and then the fewest leaders, since a name placed first can take the only clear spot of a later one. */
function namedLabels(points: ScatterPoint[], centres: { cx: number; cy: number }[], bounds: Box): Map<number, Placed> {
  const named = points.flatMap((point, index) => (point.named ? [index] : []));
  const placeAll = (order: number[]) => {
    const placed = new Map<number, Placed>();
    for (const index of order) {
      const others = centres.flatMap((centre, other) => (other === index ? [] : [{ box: dotBox(centre), named: points[other].named }]));
      const dots = { all: others.map((other) => other.box), named: others.filter((other) => other.named).map((other) => other.box) };
      const spot = placeLabel(clipLabel(points[index].label, LABEL_MAX_PX), centres[index].cx, centres[index].cy, dots, [...placed.values()], bounds);
      if (spot) placed.set(index, spot);
    }
    return placed;
  };
  const cost = (placed: Map<number, Placed>) => (named.length - placed.size) * UNPLACED_COST + [...placed.values()].reduce((sum, spot) => sum + spot.covers + (spot.leader ? LEADER_COST : 0), 0);
  return orderings(named).map(placeAll).reduce((best, placed) => (cost(placed) < cost(best) ? placed : best));
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
  const xTicks = fittedTicks(xRawMin, xRawMax);
  const yTicks = fittedTicks(yRawMin, yRawMax);
  const xMin = xTicks[0] ?? 0;
  const xMax = xTicks[xTicks.length - 1] ?? 1;
  const yMin = yTicks[0] ?? 0;
  const yMax = yTicks[yTicks.length - 1] ?? 1;
  const plotLeft = plotLeftFor(yTicks.map((t) => tickText(t, y)));
  const plotH = HEIGHT - PLOT_TOP - PLOT_BOTTOM;
  const plotBottom = PLOT_TOP + plotH;
  const xScale = scaleLinear(xMin, xMax, plotLeft, width - PLOT_RIGHT);
  const yScale = scaleLinear(yMin, yMax, plotBottom, PLOT_TOP);
  const centres = points.map((point) => ({ cx: xScale(point.x), cy: yScale(point.y) }));
  const bounds: Box = { left: plotLeft, right: width - PLOT_RIGHT, top: PLOT_TOP - LABEL_ASCENT, bottom: plotBottom };
  const labels = namedLabels(points, centres, bounds);

  return (
    <ChartFrame>
      <div ref={ref} className="flex w-full flex-col gap-1">
        <svg viewBox={`0 0 ${width} ${HEIGHT}`} width="100%" height={HEIGHT} role="img" aria-label={TH.chart.scatter}>
          <text x={plotLeft} y={12} fontSize={10} fill={AXIS_COLOR}>
            {TH.chart.axisTitle(y.label, y.unit)}
          </text>
          {yTicks.map((t) => (
            <g key={`y-${t}`}>
              <line x1={plotLeft} x2={width - PLOT_RIGHT} y1={yScale(t)} y2={yScale(t)} stroke={GRID_COLOR} />
              <text x={plotLeft - 6} y={yScale(t)} fontSize={10} fill={AXIS_COLOR} textAnchor="end" dominantBaseline="middle">
                {tickText(t, y)}
              </text>
            </g>
          ))}
          {evenTickLabels(xTicks.map((t, index) => ({ value: t, at: xScale(t), text: tickText(t, x), anchor: index === 0 ? "start" : index === xTicks.length - 1 ? "end" : "middle" }))).map((tick) => (
            <text key={`x-${tick.value}`} x={tick.at} y={plotBottom + 14} fontSize={10} fill={AXIS_COLOR} textAnchor={tick.anchor}>
              {tick.text}
            </text>
          ))}
          <text x={width - PLOT_RIGHT} y={HEIGHT - 4} fontSize={10} fill={AXIS_COLOR} textAnchor="end">
            {TH.chart.axisTitle(x.label, x.unit)}
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
                {label?.leader ? <line {...label.leader} stroke={AXIS_COLOR} strokeWidth={0.75} /> : null}
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
