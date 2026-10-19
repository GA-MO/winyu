"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/components/ui/cn";
import type { Fold, ReadRow, Strip } from "@/lib/cards/reading";
import type { Tone } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";

const TONE_TEXT: Record<Tone, string> = { bad: "text-danger", good: "text-success", neutral: "text-foreground" };
const TONE_BAR: Record<Tone, string> = { bad: "bg-danger", good: "bg-success", neutral: "bg-foreground/70" };
const TONE_CHIP: Record<Tone, string> = { bad: "bg-danger/10 text-danger", good: "bg-success/10 text-success", neutral: "bg-muted text-muted-foreground" };
const MIN_BAR_PCT = 0.8;
const FULL = 100;
const LABEL_SEPARATOR = " · ";
const FREE_START = "9999px 0 0 9999px";
const FREE_END = "0 9999px 9999px 0";

function at(strip: Strip, value: number): number {
  return ((value - strip.low) / (strip.high - strip.low || 1)) * FULL;
}

/** A change written as a small pill, coloured only when its tone means something. */
export function ChangeChip({ text, tone }: { text: string; tone: Tone }) {
  return <span className={cn("inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums", TONE_CHIP[tone])}>{text}</span>;
}

function Bar({ strip, value, className }: { strip: Strip; value: number; className: string }) {
  const from = at(strip, Math.min(strip.baseline, value));
  const width = Math.max(at(strip, Math.max(strip.baseline, value)) - from, MIN_BAR_PCT);
  return <div className={cn("absolute top-1/2 -translate-y-1/2", className)} style={{ left: `${from}%`, width: `${width}%`, borderRadius: value < strip.baseline ? FREE_START : FREE_END }} />;
}

function OverallLabel({ row }: { row: ReadRow }) {
  return (
    <div className="flex min-w-0 flex-col text-[12px] leading-snug text-muted-foreground">
      <span className="truncate">{row.label}</span>
      {row.sub ? <span className="line-clamp-4 break-words text-[11px]">{row.sub}</span> : null}
      {row.second ? <span className="break-words text-[11px]">{row.second}</span> : null}
    </div>
  );
}

/** A row named along two splits ("อุบลศรีสุข เทรดดิ้ง · อุบลราชธานี") shows its first part as the name and the rest on a small line under it, so a phone never cuts the second part off. */
function nameOf(label: string): string {
  return label.split(LABEL_SEPARATOR)[0] ?? label;
}

function placeOf(label: string): string | null {
  const rest = label.split(LABEL_SEPARATOR).slice(1);
  return rest.length > 0 ? rest.join(LABEL_SEPARATOR) : null;
}

function detailOf(row: ReadRow): string {
  return row.sub ? `${row.label}\n${row.sub}` : row.label;
}

function DecidingLine({ strip, gridRow }: { strip: Strip; gridRow: string }) {
  return (
    <div aria-hidden className="pointer-events-none relative self-stretch" style={{ gridColumn: 2, gridRow }}>
      <div className="absolute inset-y-0 w-px bg-foreground/25" style={{ left: `${at(strip, strip.baseline)}%` }} />
    </div>
  );
}

function LineStrip({ strip }: { strip: Strip }) {
  const overall = strip.overall;
  const overallLines = overall ? [overall.sub, overall.second].filter((line): line is string => line !== null) : [];
  const headRows = overall ? (overallLines.length > 0 ? 3 : 2) : 0;
  const rowsLine = `${overall ? headRows : 1} / span ${strip.rows.length + (overall ? 1 : 0)}`;
  return (
    <div className="relative grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_max-content] items-center gap-x-2.5 gap-y-1.5">
      <DecidingLine strip={strip} gridRow={rowsLine} />
      {overall ? (
        <>
          {overall.measure !== null ? <DecidingLine strip={strip} gridRow="1" /> : null}
          <div className="flex min-w-0 flex-col text-muted-foreground" style={{ gridColumn: overall.measure === null ? "1 / 3" : 1, gridRow: 1 }}>
            <span title={overall.label} className="line-clamp-2 break-words text-[12px] leading-snug">{nameOf(overall.label)}</span>
            {placeOf(overall.label) ? <span className="truncate text-[11px] leading-snug">{placeOf(overall.label)}</span> : null}
          </div>
          {overall.measure !== null ? (
            <div className="relative h-6" style={{ gridColumn: 2, gridRow: 1 }}>
              <Bar strip={strip} value={overall.measure} className={cn("h-3", TONE_BAR[overall.tone])} />
            </div>
          ) : null}
          <div className="flex flex-col items-end gap-1 text-right" style={{ gridColumn: 3, gridRow: 1 }}>
            <span className={cn("text-[22px] font-semibold leading-none tracking-tight tabular-nums", overall.change ? "text-foreground" : TONE_TEXT[overall.tone])}>{overall.text}</span>
            {overall.change ? <ChangeChip text={overall.change} tone={overall.tone} /> : null}
          </div>
          {overallLines.length > 0 ? (
            <div className="flex flex-col text-[11px] leading-snug text-muted-foreground tabular-nums" style={{ gridColumn: "1 / -1", gridRow: 2 }}>
              {overallLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          ) : null}
          <div aria-hidden className="h-px bg-border/70" style={{ gridColumn: "1 / -1", gridRow: headRows }} />
        </>
      ) : null}
      {strip.rows.map((row, index) => {
        const gridRow = index + 1 + headRows;
        return (
          <div key={row.label} className="contents">
            <div className="flex min-w-0 flex-col" style={{ gridColumn: 1, gridRow }}>
              <span title={detailOf(row)} className={cn("line-clamp-2 break-words text-[13px] leading-snug text-foreground", row.exception ? "font-semibold" : "font-medium")}>{nameOf(row.label)}</span>
              {placeOf(row.label) ? <span className="truncate text-[11px] leading-snug text-muted-foreground">{placeOf(row.label)}</span> : null}
              <RowSecond row={row} />
              {row.exception && row.sub ? <span className="line-clamp-2 break-words text-[11px] leading-snug text-muted-foreground tabular-nums">{row.sub}</span> : null}
            </div>
            <div className="relative h-4" style={{ gridColumn: 2, gridRow }}>
              {row.measure !== null ? <Bar strip={strip} value={row.measure} className={row.exception ? cn("h-2.5", TONE_BAR[row.tone]) : "h-1 bg-muted-foreground/30"} /> : null}
            </div>
            <span className={cn("text-right tabular-nums", row.exception ? cn("text-[13px] font-semibold", TONE_TEXT[row.tone]) : "text-[13px] text-foreground/75")} style={{ gridColumn: 3, gridRow }}>
              {row.valued ? row.text : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** A row's detail line (the base it was compared with), small and muted under its name. */
function RowSub({ row }: { row: ReadRow }) {
  return row.sub ? <span className="line-clamp-2 break-words text-[11px] leading-snug text-muted-foreground tabular-nums">{row.sub}</span> : null;
}

/** A row's paired reading (a second metric, a second baseline), muted under its name on every row and never cut. */
function RowSecond({ row }: { row: ReadRow }) {
  return row.second ? <span className="break-words text-[11px] leading-snug text-muted-foreground tabular-nums">{row.second}</span> : null;
}

function BoardRow({ row }: { row: ReadRow }) {
  return (
    <li className="flex flex-col gap-1">
      <div className="flex min-w-0 items-baseline gap-2">
        <span title={row.label} className={cn("min-w-0 flex-1 truncate text-[13px]", row.exception ? "font-medium text-foreground" : "text-foreground/85")}>
          {row.label}
        </span>
        <span className="shrink-0 text-[13px] font-medium tabular-nums text-foreground">{row.text}</span>
        {row.change ? <ChangeChip text={row.change} tone={row.exception ? row.tone : "neutral"} /> : null}
      </div>
      <RowSecond row={row} />
      <RowSub row={row} />
      <div className="h-1.5 w-full">
        <div className={cn("h-full rounded-full", row.exception ? "bg-foreground/55" : "bg-muted-foreground/30")} style={{ width: `${Math.max(row.fill * FULL, MIN_BAR_PCT)}%` }} />
      </div>
    </li>
  );
}

function BoardStrip({ strip }: { strip: Strip }) {
  const overall = strip.overall;
  return (
    <div className="flex flex-col gap-2.5">
      {overall ? (
        <div className="flex items-end justify-between gap-3 border-b border-border/70 pb-2.5">
          <OverallLabel row={overall} />
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-[20px] font-semibold leading-none tracking-tight tabular-nums text-foreground">{overall.text}</span>
            {overall.change ? <ChangeChip text={overall.change} tone={overall.tone} /> : null}
          </div>
        </div>
      ) : null}
      <ul className="flex flex-col gap-2">
        {strip.rows.map((row) => (
          <BoardRow key={row.label} row={row} />
        ))}
      </ul>
    </div>
  );
}

/** Style B: every row of a breakdown on one shared scale, the overall row on top; exceptions drawn thick in their colour with values, the rest thin and muted. */
export function StripView({ strip }: { strip: Strip }) {
  return strip.form === "board" ? <BoardStrip strip={strip} /> : <LineStrip strip={strip} />;
}

function ExceptionRow({ row, board }: { row: ReadRow; board: boolean }) {
  if (board) return <BoardRow row={row} />;
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <span title={row.label} className="min-w-0 truncate text-[14px] font-medium text-foreground">
          {row.label}
        </span>
        <span className={cn("shrink-0 text-[15px] font-semibold tabular-nums", TONE_TEXT[row.tone])}>{row.text}</span>
      </div>
      <RowSecond row={row} />
      <RowSub row={row} />
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("absolute inset-y-0 left-0 rounded-full", TONE_BAR[row.tone])} style={{ width: `${Math.max(row.fill * FULL, MIN_BAR_PCT)}%` }} />
      </div>
    </li>
  );
}

function PlainRow({ row }: { row: ReadRow }) {
  return (
    <li className="flex min-w-0 items-baseline justify-between gap-3 py-1 text-[13px]">
      <span className="flex min-w-0 flex-col">
        <span title={row.label} className="truncate text-muted-foreground">
          {row.label}
        </span>
        <RowSecond row={row} />
      <RowSub row={row} />
      </span>
      <span className="shrink-0 tabular-nums text-muted-foreground">
        {row.text}
        {row.change ? ` · ${row.change}` : ""}
      </span>
    </li>
  );
}

/** One muted line that expands to what it folds, ruled off from what is drawn above it. */
export function FoldToggle({ line, ruled, children }: { line: string; ruled: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={cn("flex flex-col", ruled && "border-t border-border/70 pt-2")}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="flex min-h-9 w-full items-center justify-between gap-3 rounded-lg text-left text-[13px] text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0">{open ? TH.read.hide : line}</span>
        <ChevronDown aria-hidden className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open ? <div id={id}>{children}</div> : null}
    </div>
  );
}

/** Style A's folded rows: one muted line that expands to the rows, ruled off from what is drawn above it. */
export function FoldView({ fold, ruled }: { fold: Fold; ruled: boolean }) {
  return (
    <FoldToggle line={fold.line} ruled={ruled}>
      <ul className="flex flex-col">
        {fold.rows.map((row) => (
          <PlainRow key={row.label} row={row} />
        ))}
      </ul>
    </FoldToggle>
  );
}

/** Style A: only the exception rows drawn, each with its own bar, the normal rows folded into one muted line that expands. */
export function ExceptionsView({ strip, fold }: { strip: Strip; fold: Fold | null }) {
  const board = strip.form === "board";
  return (
    <div className="flex flex-col gap-3">
      {strip.rows.length > 0 ? (
        <ul className="flex flex-col gap-3 border-t border-border/70 pt-3">
          {strip.rows.map((row) => (
            <ExceptionRow key={row.label} row={row} board={board} />
          ))}
        </ul>
      ) : null}
      {fold ? <FoldView fold={fold} ruled={strip.rows.length === 0} /> : null}
    </div>
  );
}
