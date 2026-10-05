"use client";

import { useCallback, useState, type ReactNode } from "react";
import { cn } from "./cn";
import { FORMATTER, type Formatter } from "./format";

export type ChartFormat = "number" | "currency" | "percent";
export type ChartSeries = { name: string; values: Array<number | null>; style?: "solid" | "dashed" | null };

const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const GRID_COLOR = "var(--border)";
const AXIS_COLOR = "var(--muted-foreground)";
const CHART_HEIGHT = { sm: 120, md: 180, lg: 260 } as const;

function formatChartValue(formatter: Formatter, format: ChartFormat | null | undefined, value: number) {
  if (format === "currency") return `${formatter.currencySymbol}${formatter.number(value)}`;
  if (format === "percent") return `${formatter.number(value)}%`;
  return formatter.number(value);
}

function compactTick(formatter: Formatter, format: ChartFormat | null | undefined, value: number) {
  return formatter.compact(value, format ?? "number");
}

function scale(d0: number, d1: number, r0: number, r1: number) {
  const span = d1 - d0 || 1;
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}

function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0];
  const rough = max / count;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const unit = [1, 2, 5, 10].map((m) => m * pow).find((u) => u >= rough) ?? pow * 10;
  const ticks: number[] = [];
  for (let v = 0; v <= max + unit * 0.001; v += unit) ticks.push(Math.round(v * 1e6) / 1e6);
  if ((ticks[ticks.length - 1] ?? 0) < max) ticks.push((ticks[ticks.length - 1] ?? 0) + unit);
  return ticks;
}

type DrawnPoint = { index: number; x: number; y: number; value: number };

function definedPoint(value: number | null | undefined, index: number, px: number, y: (value: number) => number): DrawnPoint | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return { index, x: px, y: y(Math.max(0, value)), value };
}

function linePath(points: Array<DrawnPoint | null>): string {
  const segments: string[] = [];
  let open = false;
  points.forEach((point) => {
    if (!point) {
      open = false;
      return;
    }
    segments.push(`${open ? "L" : "M"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`);
    open = true;
  });
  return segments.join(" ");
}

function seriesMax(series: ChartSeries[], stacked: boolean) {
  const n = Math.max(0, ...series.map((s) => s.values.length));
  let max = 0;
  for (let i = 0; i < n; i += 1) {
    if (stacked) {
      max = Math.max(max, series.reduce((sum, s) => sum + Math.max(0, s.values[i] ?? 0), 0));
    } else {
      for (const s of series) max = Math.max(max, s.values[i] ?? 0);
    }
  }
  return max;
}

function clipLabel(text: string, maxPx: number) {
  const max = Math.max(3, Math.floor(maxPx / 6.5));
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function thinLabels(count: number, maxLabels: number): Set<number> {
  if (count <= maxLabels) return new Set(Array.from({ length: count }, (_, i) => i));
  const step = Math.ceil((count - 1) / (maxLabels - 1));
  const picked: number[] = [];
  for (let i = 0; i < count - 1; i += step) picked.push(i);
  const last = count - 1;
  if ((picked[picked.length - 1] ?? -Infinity) > last - step) picked.pop();
  picked.push(last);
  return new Set(picked);
}

function useContainerWidth(fallback = 320) {
  const [width, setWidth] = useState(fallback);
  const ref = useCallback((node: HTMLDivElement | null) => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const w = Math.round(node.getBoundingClientRect().width);
      if (w > 0) setWidth(w);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

function ChartLegend({ series }: { series: ChartSeries[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {series.map((s, i) => (
        <li key={`${i}-${s.name}`} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block size-2.5 shrink-0 rounded-full"
            style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
          />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

function ChartFrame({ title, children }: { title?: string | null; children: ReactNode }) {
  return (
    <div className="w-full min-w-0 rounded-xl border border-primary/15 bg-gradient-to-br from-card to-primary/5 p-3">
      {title ? (
        <p className="mb-2 text-sm font-semibold text-foreground">{title}</p>
      ) : null}
      {children}
    </div>
  );
}

type BarChartProps = {
  title?: string | null;
  labels?: string[] | null;
  series?: ChartSeries[] | null;
  horizontal?: boolean | null;
  stacked?: boolean | null;
  showValues?: boolean | null;
  format?: ChartFormat | null;
  height?: "sm" | "md" | "lg" | null;
};

export function BarChart({ props }: { props: BarChartProps }) {
  const formatter = FORMATTER;
  const [ref, width] = useContainerWidth();
  const labels = props.labels ?? [];
  const series = (props.series ?? []).slice(0, 5);
  const stacked = props.stacked ?? false;
  const showValues = props.showValues ?? false;
  const format = props.format ?? "number";
  const n = labels.length;
  const ticks = niceTicks(seriesMax(series, stacked));
  const top = ticks[ticks.length - 1] ?? 0;
  const fmt = (v: number) => formatChartValue(formatter, format, v);
  const color = (i: number) =>
    series.length === 1 ? SERIES_COLORS[0] : SERIES_COLORS[i % SERIES_COLORS.length];
  const rowValue = (i: number) =>
    stacked
      ? series.reduce((sum, s) => sum + Math.max(0, s.values[i] ?? 0), 0)
      : Math.max(0, ...series.map((s) => s.values[i] ?? 0));

  if (n === 0 || series.length === 0) {
    return (
      <ChartFrame title={props.title}>
        <p className="text-sm text-muted-foreground/70">No data</p>
      </ChartFrame>
    );
  }

  if (props.horizontal ?? false) {
    const LABEL_W = Math.min(108, Math.max(64, width * 0.28));
    const rowH = stacked || series.length === 1 ? 24 : 12 * series.length + 10;
    const height = n * rowH + 20;
    const right = width - (showValues ? 56 : 12);
    const x = scale(0, top, LABEL_W, right);
    const shown = thinLabels(ticks.length, Math.max(2, Math.floor((right - LABEL_W) / 52)));
    return (
      <ChartFrame title={props.title}>
        <div ref={ref} className="flex w-full flex-col gap-1.5">
          <ChartLegend series={series} />
          <svg
            viewBox={`0 0 ${width} ${height}`}
            width="100%"
            height={height}
            role="img"
            aria-label={props.title ?? "Bar chart"}
          >
            {ticks.map((t) => (
              <line key={t} x1={x(t)} x2={x(t)} y1={0} y2={n * rowH} stroke={GRID_COLOR} />
            ))}
            {labels.map((label, i) => {
              const y0 = i * rowH;
              const barH = stacked || series.length === 1 ? rowH - 8 : 10;
              let acc = 0;
              return (
                <g key={`${i}-${label}`}>
                  <text
                    x={LABEL_W - 8}
                    y={y0 + rowH / 2}
                    fontSize={11}
                    fill={AXIS_COLOR}
                    textAnchor="end"
                    dominantBaseline="middle"
                  >
                    {clipLabel(label, LABEL_W - 12)}
                  </text>
                  {series.map((s, si) => {
                    const v = Math.max(0, s.values[i] ?? 0);
                    const start = stacked ? acc : 0;
                    if (stacked) acc += v;
                    const by = stacked || series.length === 1 ? y0 + 4 : y0 + 5 + si * 12;
                    const x0 = x(start);
                    return (
                      <rect
                        key={s.name}
                        x={x0}
                        y={by}
                        width={Math.max(0, x(start + v) - x0)}
                        height={barH}
                        rx={3}
                        fill={color(si)}
                      >
                        <title>{`${label} · ${s.name}: ${fmt(v)}`}</title>
                      </rect>
                    );
                  })}
                  {showValues ? (
                    <text
                      x={x(rowValue(i)) + 5}
                      y={y0 + rowH / 2}
                      fontSize={11}
                      fill="var(--foreground)"
                      fontWeight={500}
                      dominantBaseline="middle"
                    >
                      {fmt(rowValue(i))}
                    </text>
                  ) : null}
                </g>
              );
            })}
            {ticks.map((t, ti) =>
              shown.has(ti) ? (
                <text
                  key={`t${t}`}
                  x={x(t)}
                  y={n * rowH + 14}
                  fontSize={10}
                  fill={AXIS_COLOR}
                  textAnchor={ti === ticks.length - 1 ? "end" : ti === 0 ? "start" : "middle"}
                >
                  {compactTick(formatter, format, t)}
                </text>
              ) : null,
            )}
          </svg>
        </div>
      </ChartFrame>
    );
  }

  const AXIS_W = 44;
  const height = CHART_HEIGHT[props.height ?? "md"];
  const plotH = height - 24;
  const y = scale(0, top, plotH, 6);
  const slotW = (width - AXIS_W - 8) / n;
  const groupW = Math.min(slotW * 0.7, 48);
  const barW = stacked || series.length === 1 ? groupW : groupW / series.length;
  const shownLabels = thinLabels(n, Math.max(2, Math.floor((width - AXIS_W) / 48)));

  return (
    <ChartFrame title={props.title}>
      <div ref={ref} className="flex w-full flex-col gap-1.5">
        <ChartLegend series={series} />
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          role="img"
          aria-label={props.title ?? "Bar chart"}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={AXIS_W} x2={width - 4} y1={y(t)} y2={y(t)} stroke={GRID_COLOR} />
              <text
                x={AXIS_W - 6}
                y={y(t)}
                fontSize={10}
                fill={AXIS_COLOR}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {compactTick(formatter, format, t)}
              </text>
            </g>
          ))}
          {labels.map((label, i) => {
            const cx = AXIS_W + slotW * i + slotW / 2;
            let acc = 0;
            return (
              <g key={`${i}-${label}`}>
                {series.map((s, si) => {
                  const v = Math.max(0, s.values[i] ?? 0);
                  const start = stacked ? acc : 0;
                  if (stacked) acc += v;
                  const bx =
                    stacked || series.length === 1
                      ? cx - groupW / 2
                      : cx - groupW / 2 + si * barW;
                  const yTop = y(start + v);
                  return (
                    <rect
                      key={s.name}
                      x={bx}
                      y={yTop}
                      width={Math.max(1, barW - 1)}
                      height={Math.max(0, y(start) - yTop)}
                      rx={3}
                      fill={color(si)}
                    >
                      <title>{`${label} · ${s.name}: ${fmt(v)}`}</title>
                    </rect>
                  );
                })}
                {showValues ? (
                  <text
                    x={cx}
                    y={y(rowValue(i)) - 4}
                    fontSize={10}
                    fill="var(--foreground)"
                    fontWeight={500}
                    textAnchor="middle"
                  >
                    {fmt(rowValue(i))}
                  </text>
                ) : null}
                {shownLabels.has(i) ? (
                  <text x={cx} y={height - 6} fontSize={10} fill={AXIS_COLOR} textAnchor="middle">
                    {clipLabel(label, slotW - 4)}
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

type LineChartProps = {
  title?: string | null;
  labels?: string[] | null;
  series?: ChartSeries[] | null;
  area?: boolean | null;
  showDots?: boolean | null;
  format?: ChartFormat | null;
  height?: "sm" | "md" | "lg" | null;
};

export function LineChart({ props }: { props: LineChartProps }) {
  const formatter = FORMATTER;
  const [ref, width] = useContainerWidth();
  const labels = props.labels ?? [];
  const series = (props.series ?? []).slice(0, 5);
  const format = props.format ?? "number";
  const n = labels.length;
  const AXIS_W = 44;
  const height = CHART_HEIGHT[props.height ?? "md"];
  const plotH = height - 24;
  const ticks = niceTicks(seriesMax(series, false));
  const top = ticks[ticks.length - 1] ?? 0;
  const x = scale(0, Math.max(1, n - 1), AXIS_W + 4, width - 8);
  const y = scale(0, top, plotH, 6);
  const shown = thinLabels(n, Math.max(2, Math.min(12, Math.floor((width - AXIS_W) / 56))));
  const dots = (props.showDots ?? false) || n <= 14;
  const fmt = (v: number) => formatChartValue(formatter, format, v);

  if (n === 0 || series.length === 0) {
    return (
      <ChartFrame title={props.title}>
        <p className="text-sm text-muted-foreground/70">No data</p>
      </ChartFrame>
    );
  }

  return (
    <ChartFrame title={props.title}>
      <div ref={ref} className="flex w-full flex-col gap-1.5">
        <ChartLegend series={series} />
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          role="img"
          aria-label={props.title ?? "Line chart"}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={AXIS_W} x2={width - 4} y1={y(t)} y2={y(t)} stroke={GRID_COLOR} />
              <text
                x={AXIS_W - 6}
                y={y(t)}
                fontSize={10}
                fill={AXIS_COLOR}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {compactTick(formatter, format, t)}
              </text>
            </g>
          ))}
          {series.map((s, si) => {
            const stroke = series.length === 1 ? SERIES_COLORS[0] : SERIES_COLORS[si % SERIES_COLORS.length];
            const pts = labels.map((_, i) => definedPoint(s.values[i], i, x(i), y));
            const drawn = pts.filter((point): point is DrawnPoint => point !== null);
            const path = linePath(pts);
            const first = drawn[0];
            const last = drawn[drawn.length - 1];
            const areaPath = first && last ? `${path} L ${last.x.toFixed(1)} ${plotH} L ${first.x.toFixed(1)} ${plotH} Z` : "";
            return (
              <g key={s.name}>
                {props.area && areaPath ? <path d={areaPath} fill={stroke} opacity={0.12} /> : null}
                <path
                  d={path}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={2}
                  strokeDasharray={s.style === "dashed" ? "5 4" : undefined}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {dots
                  ? drawn.map((point) => (
                      <circle key={point.index} cx={point.x} cy={point.y} r={2.75} fill={stroke}>
                        <title>{`${labels[point.index] ?? ""} · ${s.name}: ${fmt(point.value)}`}</title>
                      </circle>
                    ))
                  : null}
              </g>
            );
          })}
          {labels.map((label, i) =>
            shown.has(i) ? (
              <text
                key={i}
                x={x(i)}
                y={height - 6}
                fontSize={10}
                fill={AXIS_COLOR}
                textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
              >
                {label}
              </text>
            ) : null,
          )}
        </svg>
      </div>
    </ChartFrame>
  );
}
