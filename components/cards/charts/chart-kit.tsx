"use client";

import { useCallback, useState, type ReactNode } from "react";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/i18n/format";
import type { ColorScale, HeatCell } from "@/lib/cards/present";
import type { MetricFormat, Tone } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";

export const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
export const GRID_COLOR = "var(--border)";
export const AXIS_COLOR = "var(--muted-foreground)";
export const CHART_HEIGHT = { sm: 120, md: 180, lg: 260 } as const;
export const AXIS_W = 44;

const VALUE_MIN_MIX = 8;
const VALUE_MAX_MIX = 70;
const DELTA_MIN_MIX = 8;
const DELTA_MAX_MIX = 60;
const TEXT_SWITCH_INTENSITY = 0.6;

/** Maps a domain span onto a pixel range, the way every chart in this kit places a value on an axis. */
export function scaleLinear(d0: number, d1: number, r0: number, r1: number): (value: number) => number {
  const span = d1 - d0 || 1;
  return (value: number) => r0 + ((value - d0) / span) * (r1 - r0);
}

/** Round tick step over [0, max], the same rule components/ui/charts uses so axes read alike. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0];
  const rough = max / count;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const unit = [1, 2, 5, 10].map((m) => m * pow).find((u) => u >= rough) ?? pow * 10;
  const ticks: number[] = [];
  for (let v = 0; v <= max + unit * 0.001; v += unit) ticks.push(Math.round(v * 1e6) / 1e6);
  if ((ticks[ticks.length - 1] ?? 0) < max) ticks.push((ticks[ticks.length - 1] ?? 0) + unit);
  return ticks;
}

/** Round ticks over a span that may dip below zero, for axes a scatter's negative deltas need. */
export function niceRange(min: number, max: number, count = 4): number[] {
  if (min === max) return [min];
  const rough = (max - min) / count;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const unit = [1, 2, 5, 10].map((m) => m * pow).find((u) => u >= rough) ?? pow * 10;
  const start = Math.floor(min / unit) * unit;
  const end = Math.ceil(max / unit) * unit;
  const ticks: number[] = [];
  for (let v = start; v <= end + unit * 0.001; v += unit) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

export function thinLabels(count: number, maxLabels: number): Set<number> {
  if (count <= maxLabels) return new Set(Array.from({ length: count }, (_, i) => i));
  const step = Math.ceil((count - 1) / (maxLabels - 1));
  const picked: number[] = [];
  for (let i = 0; i < count - 1; i += step) picked.push(i);
  const last = count - 1;
  if ((picked[picked.length - 1] ?? -Infinity) > last - step) picked.pop();
  picked.push(last);
  return new Set(picked);
}

export function clipLabel(text: string, maxPx: number): string {
  const max = Math.max(3, Math.floor(maxPx / 6.5));
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function useContainerWidth(fallback = 320): readonly [(node: HTMLDivElement | null) => void, number] {
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

export function ChartFrame({ title, children }: { title?: string | null; children: ReactNode }) {
  return (
    <div className="w-full min-w-0 rounded-xl border border-primary/15 bg-gradient-to-br from-card to-primary/5 p-3">
      {title ? <p className="mb-2 text-sm font-semibold text-foreground">{title}</p> : null}
      {children}
    </div>
  );
}

export function EmptyChart() {
  return <p className="text-sm text-muted-foreground/70">{TH.chart.noData}</p>;
}

export function ChartLegend({ items }: { items: { name: string; color: string }[] }) {
  if (items.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {items.map((item) => (
        <li key={item.name} className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
          {item.name}
        </li>
      ))}
    </ul>
  );
}

/** An axis tick the way the rest of Winyu already formats a metric value — no separate compact formatter to keep in sync. */
export function formatTick(value: number, format: MetricFormat): string {
  if (format === "currency") return formatCurrency(value);
  if (format === "percent") return formatPercent(value);
  return formatNumber(value);
}

/** A donut/pie wedge path; the same arc the donut and pie share. */
export function arcPath(cx: number, cy: number, rOuter: number, rInner: number, a0: number, a1: number): string {
  const full = a1 - a0 >= Math.PI * 2 - 1e-6;
  const end = full ? a0 + Math.PI * 2 - 1e-4 : a1;
  const large = end - a0 > Math.PI ? 1 : 0;
  const p = (r: number, a: number) => `${cx + r * Math.sin(a)},${cy - r * Math.cos(a)}`;
  const outer = `M${p(rOuter, a0)} A${rOuter},${rOuter} 0 ${large} 1 ${p(rOuter, end)}`;
  if (rInner <= 0) return `${outer} L${cx},${cy} Z`;
  return `${outer} L${p(rInner, end)} A${rInner},${rInner} 0 ${large} 0 ${p(rInner, a0)} Z`;
}

/** The presenter's catch-all slice draws muted instead of taking the next series colour. */
export function sliceColor(isOther: boolean, index: number): string {
  if (isOther) return "var(--muted-foreground)";
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

export function toneTextClass(tone: Tone): string {
  if (tone === "good") return "text-success";
  if (tone === "bad") return "text-danger";
  return "text-muted-foreground";
}

/** A cell's background: primary intensity for a value scale, tone colour intensity for a delta scale. */
export function heatCellBackground(cell: HeatCell, scale: ColorScale): string {
  if (scale === "value") {
    const pct = VALUE_MIN_MIX + cell.intensity * (VALUE_MAX_MIX - VALUE_MIN_MIX);
    return `color-mix(in oklab, var(--primary) ${pct}%, var(--card))`;
  }
  const base = cell.tone === "good" ? "var(--color-success)" : cell.tone === "bad" ? "var(--color-danger)" : "var(--muted)";
  const pct = DELTA_MIN_MIX + cell.intensity * (DELTA_MAX_MIX - DELTA_MIN_MIX);
  return `color-mix(in oklab, ${base} ${pct}%, var(--card))`;
}

export function heatCellTextClass(cell: HeatCell, scale: ColorScale): string {
  return scale === "value" && cell.intensity > TEXT_SWITCH_INTENSITY ? "text-primary-foreground" : "text-foreground";
}

export function heatCellTitle(row: string, column: string, cell: HeatCell): string {
  return cell.detail ? `${row} · ${column}: ${cell.text} · ${cell.detail}` : `${row} · ${column}: ${cell.text}`;
}

function legendGradient(scale: ColorScale): string {
  if (scale === "delta") return "linear-gradient(to right, var(--color-danger), var(--muted), var(--color-success))";
  return "linear-gradient(to right, var(--card), var(--primary))";
}

/** The short caption a heatmap or map shows under the grid, with a swatch hinting at what the colour means. */
export function LegendCaption({ text, scale }: { text: string; scale: ColorScale }) {
  return (
    <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
      <span aria-hidden className="h-2 w-10 shrink-0 rounded-full border border-border" style={{ background: legendGradient(scale) }} />
      <span>{text}</span>
    </div>
  );
}
