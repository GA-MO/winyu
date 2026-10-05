"use client";

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
  niceRange,
  scaleLinear,
  thinLabels,
  useContainerWidth,
} from "./chart-kit";

const ACTUAL_COLOR = SERIES_COLORS[0];
const FORECAST_COLOR = SERIES_COLORS[1];
const STROKE_WIDTH = 2;
const BAND_OPACITY = 0.18;
const DASH = "5 4";
const WEEK_PREFIX = /^สัปดาห์\s*/;

type ForecastBandProps = {
  labels: string[];
  actual: (number | null)[];
  forecast: (number | null)[];
  lo: (number | null)[];
  hi: (number | null)[];
  format: MetricFormat;
};

type Point = { x: number; y: number };

function pathOf(points: Point[]): string {
  return points.map((point, i) => `${i === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

function pointsOf(values: (number | null)[], x: (i: number) => number, y: (v: number) => number): Point[] {
  return values.flatMap((value, i) => (value === null ? [] : [{ x: x(i), y: y(value) }]));
}

function known(values: (number | null)[]): number[] {
  return values.filter((value): value is number => value !== null);
}

/** Actual weeks as a solid line, then the forecast as a dashed line inside its shaded band — the range the forecast expects, which the plain LineChart cannot draw. */
export function ForecastBand({ labels, actual, forecast, lo, hi, format }: ForecastBandProps) {
  const [ref, width] = useContainerWidth();
  const n = labels.length;
  const all = [...known(actual), ...known(forecast), ...known(lo), ...known(hi)];
  if (n === 0 || all.length === 0) {
    return (
      <ChartFrame>
        <EmptyChart />
      </ChartFrame>
    );
  }
  const height = CHART_HEIGHT.md;
  const plotH = height - 24;
  const ticks = niceRange(Math.min(...all), Math.max(...all));
  const x = scaleLinear(0, Math.max(1, n - 1), AXIS_W + 4, width - 8);
  const low = ticks[0] ?? 0;
  const high = ticks.length > 1 ? ticks[ticks.length - 1] : low + 1;
  const y = scaleLinear(low, high, plotH, 6);
  const shown = thinLabels(n, Math.max(2, Math.min(12, Math.floor((width - AXIS_W) / 56))));
  const labelBudget = (width - AXIS_W) / Math.max(1, shown.size);
  const upper = pointsOf(hi, x, y);
  const lower = pointsOf(lo, x, y);
  const band = upper.length > 1 ? `${pathOf(upper)} ${pathOf([...lower].reverse()).replace("M", "L")} Z` : null;
  const hasActual = known(actual).length > 0;
  const legend = [
    ...(hasActual ? [{ name: TH.dash.forecastActual, color: ACTUAL_COLOR }] : []),
    { name: TH.dash.forecast, color: FORECAST_COLOR },
    { name: TH.dash.forecastBand, color: `color-mix(in oklab, ${FORECAST_COLOR} 35%, transparent)` },
  ];

  return (
    <ChartFrame>
      <div ref={ref} className="flex w-full flex-col gap-1.5">
        <ChartLegend items={legend} />
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label={TH.chart.forecast}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={AXIS_W} x2={width - 4} y1={y(t)} y2={y(t)} stroke={GRID_COLOR} />
              <text x={AXIS_W - 6} y={y(t)} fontSize={10} fill={AXIS_COLOR} textAnchor="end" dominantBaseline="middle">
                {formatTick(t, format)}
              </text>
            </g>
          ))}
          {band ? <path d={band} fill={FORECAST_COLOR} fillOpacity={BAND_OPACITY} stroke="none" /> : null}
          {hasActual ? (
            <path d={pathOf(pointsOf(actual, x, y))} fill="none" stroke={ACTUAL_COLOR} strokeWidth={STROKE_WIDTH} strokeLinejoin="round" strokeLinecap="round" />
          ) : null}
          <path d={pathOf(pointsOf(forecast, x, y))} fill="none" stroke={FORECAST_COLOR} strokeWidth={STROKE_WIDTH} strokeDasharray={DASH} strokeLinejoin="round" strokeLinecap="round" />
          {labels.map((label, i) =>
            shown.has(i) ? (
              <text key={i} x={x(i)} y={height - 6} fontSize={10} fill={AXIS_COLOR} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>
                {clipLabel(label.replace(WEEK_PREFIX, ""), labelBudget)}
              </text>
            ) : null,
          )}
        </svg>
      </div>
    </ChartFrame>
  );
}
