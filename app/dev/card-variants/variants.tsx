"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { COPY } from "./copy";
import type { Reading, ReadRow, Tone } from "./reading";

const TONE_TEXT: Record<Tone, string> = { bad: "text-danger", good: "text-success", neutral: "text-foreground" };
const TONE_CHIP: Record<Tone, string> = { bad: "bg-danger/10 text-danger", good: "bg-success/10 text-success", neutral: "bg-muted text-muted-foreground" };
const TONE_BAR: Record<Tone, string> = { bad: "bg-danger", good: "bg-success", neutral: "bg-foreground/70" };
const ROW_LABEL = "data-row-label";
const PRIMARY = "inline-flex min-h-10 items-center rounded-full bg-ink px-4 text-[13px] font-medium text-ink-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function wordsOn(element: HTMLElement): number {
  const copy = element.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(`[${ROW_LABEL}]`).forEach((node) => node.remove());
  const walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
  const texts: string[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode.textContent ?? "");
  const segmenter = new Intl.Segmenter("th", { granularity: "word" });
  return [...segmenter.segment(texts.join(" "))].filter((segment) => segment.isWordLike).length;
}

/** Wraps one variant with its dev label and a live count of the words on the card, row labels excluded. */
export function VariantFrame({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const card = useRef<HTMLDivElement>(null);
  const [words, setWords] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = card.current;
    if (!element) return;
    const count = () => setWords(wordsOn(element));
    count();
    const observer = new MutationObserver(count);
    observer.observe(element, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-baseline justify-between px-1 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground/80">{label}</span>
        <span className="tabular-nums">{words === null ? "" : COPY.words(words)}</span>
      </p>
      <div ref={card} data-shot={id}>{children}</div>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <section className="flex w-full min-w-0 flex-col gap-4 rounded-2xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_var(--ui-card-edge),0_14px_34px_-22px_var(--ui-glow-soft)]">{children}</section>;
}

function Verdict({ text }: { text: string }) {
  return <h3 className="text-[19px] font-semibold leading-[1.35] tracking-tight text-foreground text-balance">{text}</h3>;
}

function DeltaChip({ text, tone }: { text: string | null; tone: Tone }) {
  if (!text) return null;
  return <span className={cn("rounded-full px-2 py-0.5 text-[13px] font-semibold tabular-nums", TONE_CHIP[tone])}>{text}</span>;
}

function Actions({ reading }: { reading: Reading }) {
  if (!reading.primary) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button type="button" title={reading.primary.reason} className={PRIMARY}>{reading.primary.label}</button>
    </div>
  );
}

function Footer({ text }: { text: string }) {
  return <p className="-mt-1 text-[11px] tabular-nums text-muted-foreground/80">{text}</p>;
}

function Disclosure({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full items-center justify-between gap-3 rounded-lg py-1 text-left text-[13px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span>{open ? COPY.hide : label}</span>
      <ChevronDown aria-hidden className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
    </button>
  );
}

function rowTone(reading: Reading, row: ReadRow): Tone {
  if (!row.exception) return "neutral";
  if (reading.kind === "attainment") return "bad";
  return row.measure < 0 ? "bad" : "good";
}

function fillOf(reading: Reading, row: ReadRow): number {
  if (reading.kind === "attainment") return Math.min(row.measure, 100);
  return Math.min(Math.abs(row.measure), 100);
}

function ExceptionRow({ reading, row }: { reading: Reading; row: ReadRow }) {
  const tone = rowTone(reading, row);
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span data-row-label className="min-w-0 truncate text-[15px] font-medium text-foreground">{row.label}</span>
        <span className={cn("shrink-0 text-[17px] font-semibold tabular-nums", TONE_TEXT[tone])}>{row.measureText}</span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("absolute inset-y-0 left-0 rounded-full", TONE_BAR[tone])} style={{ width: `${fillOf(reading, row)}%` }} />
      </div>
    </li>
  );
}

function PlainRow({ row }: { row: ReadRow }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-1 text-[13px]">
      <span data-row-label className="min-w-0 truncate text-muted-foreground">{row.label}</span>
      <span className="shrink-0 tabular-nums text-muted-foreground">{row.measureText}</span>
    </li>
  );
}

/** A: the verdict, the hero, only the exception rows drawn, the rest folded into one muted line. */
export function VariantA({ reading }: { reading: Reading }) {
  const [open, setOpen] = useState(false);
  const drawn = reading.exceptions.filter((row) => row.label !== reading.hero.row?.label);
  return (
    <Shell>
      <Verdict text={reading.verdict} />
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[32px] font-semibold leading-none tracking-tight tabular-nums text-foreground">{reading.hero.value}</span>
          {reading.hero.suffix ? <span className="text-[15px] text-muted-foreground">{reading.hero.suffix}</span> : null}
          <DeltaChip text={reading.hero.delta} tone={reading.hero.deltaTone} />
        </div>
        <p className="text-[13px] text-muted-foreground">
          <span data-row-label={reading.hero.row ? "" : undefined}>{reading.hero.label}</span>
          {reading.hero.detail ? <span className="tabular-nums"> · {reading.hero.detail}</span> : null}
        </p>
      </div>
      {drawn.length > 0 ? <ul className="flex flex-col gap-3 border-t border-border/70 pt-3">{drawn.map((row) => <ExceptionRow key={row.label} reading={reading} row={row} />)}</ul> : null}
      {reading.restLine ? (
        <div className={cn("flex flex-col", drawn.length === 0 && "border-t border-border/70 pt-2")}>
          <Disclosure label={reading.restLine} open={open} onToggle={() => setOpen(!open)} />
          {open ? <ul className="flex flex-col">{reading.rest.map((row) => <PlainRow key={row.label} row={row} />)}</ul> : null}
        </div>
      ) : null}
      <Actions reading={reading} />
      <Footer text={reading.footer} />
    </Shell>
  );
}

type Scale = { low: number; high: number };

function scaleOf(reading: Reading): Scale {
  const measures = [...reading.rows.map((row) => row.measure), reading.overall.measure, reading.baseline];
  const low = Math.min(...measures);
  const high = Math.max(...measures);
  const pad = (high - low) * 0.04;
  return { low: low - pad, high: high + pad };
}

function at(scale: Scale, value: number): number {
  return ((value - scale.low) / (scale.high - scale.low)) * 100;
}

function Bar({ scale, from, to, className }: { scale: Scale; from: number; to: number; className: string }) {
  const left = at(scale, Math.min(from, to));
  const width = Math.max(at(scale, Math.max(from, to)) - left, 0.8);
  return <div className={cn("absolute top-1/2 -translate-y-1/2 rounded-full", className)} style={{ left: `${left}%`, width: `${width}%` }} />;
}

function ranked(reading: Reading): ReadRow[] {
  return reading.kind === "attainment" ? [...reading.rows].sort((a, b) => a.measure - b.measure) : reading.rows;
}

function shownValues(reading: Reading): Set<string> {
  const sorted = [...reading.rest].sort((a, b) => a.measure - b.measure);
  const extreme = sorted[sorted.length - 1];
  return new Set([...reading.exceptions, ...(extreme ? [extreme] : [])].map((row) => row.label));
}

function StripRow({ reading, row, scale, valued }: { reading: Reading; row: ReadRow; scale: Scale; valued: boolean }) {
  const tone = rowTone(reading, row);
  return (
    <li className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_3.25rem] items-center gap-2">
      <span data-row-label className={cn("truncate", row.exception ? "text-[13px] font-medium text-foreground" : "text-[12px] text-muted-foreground")}>{row.label}</span>
      <div className="relative h-4">
        <Bar scale={scale} from={reading.baseline} to={row.measure} className={row.exception ? cn("h-2.5", TONE_BAR[tone]) : "h-1 bg-muted-foreground/30"} />
      </div>
      <span className={cn("text-right tabular-nums", row.exception ? cn("text-[13px] font-semibold", TONE_TEXT[tone]) : "text-[12px] text-muted-foreground")}>{valued ? row.measureText : ""}</span>
    </li>
  );
}

/** B: the verdict, then one strip where the overall row is the hero and every row sits on the same scale around the baseline. */
export function VariantB({ reading }: { reading: Reading }) {
  const scale = scaleOf(reading);
  const valued = shownValues(reading);
  const baselineAt = at(scale, reading.baseline);
  return (
    <Shell>
      <Verdict text={reading.verdict} />
      <div className="relative flex flex-col gap-2">
        <div className="pointer-events-none absolute inset-y-0 left-0 right-0 grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_3.25rem] gap-2" aria-hidden>
          <span />
          <div className="relative">
            <div className="absolute inset-y-0 w-px bg-foreground/25" style={{ left: `${baselineAt}%` }} />
          </div>
        </div>
        <div className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_3.25rem] items-end gap-2 border-b border-border/70 pb-2.5">
          <div className="flex flex-col">
            <span className="text-[12px] text-muted-foreground">{reading.overall.label}</span>
            {reading.kind === "attainment" ? <span className="text-[12px] text-muted-foreground">{COPY.ofTarget}</span> : null}
          </div>
          <div className="relative h-6 self-center">
            <Bar scale={scale} from={reading.baseline} to={reading.overall.measure} className={cn("h-3", TONE_BAR[reading.overall.tone])} />
          </div>
          <span className={cn("text-right text-[22px] font-semibold leading-none tracking-tight tabular-nums", TONE_TEXT[reading.overall.tone])}>{reading.overall.text.replace("%", "")}<span className="text-[13px]">%</span></span>
        </div>
        <ul className="flex flex-col gap-1">
          {ranked(reading).map((row) => <StripRow key={row.label} reading={reading} row={row} scale={scale} valued={valued.has(row.label)} />)}
        </ul>
      </div>
      <Actions reading={reading} />
      <Footer text={reading.footer} />
    </Shell>
  );
}

/** C: the verdict, three tiles that carry the decision, every row behind one toggle. */
export function VariantC({ reading }: { reading: Reading }) {
  const [open, setOpen] = useState(false);
  return (
    <Shell>
      <Verdict text={reading.verdict} />
      <dl className="grid grid-cols-3 gap-2">
        {reading.tiles.map((tile) => (
          <div key={tile.label} className="flex min-w-0 flex-col gap-1 rounded-xl bg-muted/60 px-2.5 py-2.5">
            <dt className="truncate text-[11px] text-muted-foreground">{tile.label}</dt>
            <dd className={cn("text-[20px] font-semibold leading-none tracking-tight tabular-nums", TONE_TEXT[tile.tone])}>{tile.value}</dd>
            <dd data-row-label={tile.named ? "" : undefined} className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{tile.sub}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col">
        <Disclosure label={reading.expandLabel} open={open} onToggle={() => setOpen(!open)} />
        {open ? (
          <ul className="flex flex-col">
            {reading.rows.map((row) => (
              <li key={row.label} className="flex items-baseline justify-between gap-3 py-1 text-[13px]">
                <span data-row-label className={cn("min-w-0 truncate", row.exception ? "text-foreground" : "text-muted-foreground")}>{row.label}</span>
                <span className={cn("shrink-0 tabular-nums", row.exception ? cn("font-semibold", TONE_TEXT[rowTone(reading, row)]) : "text-muted-foreground")}>{row.measureText}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <Actions reading={reading} />
      <Footer text={reading.footer} />
    </Shell>
  );
}
