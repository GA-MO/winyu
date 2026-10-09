import type { ReactNode } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { dueTimeTh, formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { CheckInChat, DELTA_TONE, Delta, FEED_TONE_FILL, FEED_TONE_TEXT, MoreMenu, OutcomeField, Primary, Reason, SEVERITY_FILL, Specimen, Verdict } from "./parts";
import { gapRatio, type AlertRow, type Figure, type HandoffRow, type Severity, type Specimens, type TodoRow } from "./rows";

const S = TH.inboxRows.sections;
const DOT: Record<Severity, string> = {
  P1: "left-[9px] top-1 size-3.5 ring-4 ring-danger/15",
  P2: "left-[11px] top-1.5 size-2.5",
  P3: "left-[12px] top-[7px] size-2 opacity-60",
};
const PERCENT = 100;

function Rail({ children }: { children: ReactNode }) {
  return (
    <ol className="relative flex flex-col gap-5 py-4 pl-10 pr-3 before:absolute before:inset-y-4 before:left-[15px] before:w-px before:bg-border">{children}</ol>
  );
}

function Node({ marker, children }: { marker: ReactNode; children: ReactNode }) {
  return (
    <li className="relative flex flex-col gap-1">
      <span className="absolute -left-10 top-0 h-full w-10">{marker}</span>
      {children}
    </li>
  );
}

function Dot({ className }: { className: string }) {
  return <span aria-hidden className={cn("absolute rounded-full", className)} />;
}

function DayMark({ at }: { at: string }) {
  return <li className="-ml-6 w-fit rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{formatDateTh(at)}</li>;
}

function Initial({ name, urgent }: { name: string; urgent: boolean }) {
  const letter = name.replace("คุณ", "").slice(0, 1);
  return (
    <span aria-hidden className={cn("absolute left-0.5 top-0 flex size-7 items-center justify-center rounded-full bg-bubble text-xs font-semibold text-primary ring-4 ring-card", urgent && "outline-2 outline-offset-1 outline-danger")}>
      {letter}
    </span>
  );
}

function TodoNode({ row }: { row: TodoRow }) {
  return (
    <Node marker={<Dot className={cn("left-[11px] top-1.5 size-2.5", FEED_TONE_FILL[row.tone])} />}>
      <p className="text-sm leading-snug tracking-tight">
        <span className="font-semibold">{row.title}</span> <span className={cn("whitespace-nowrap font-display font-semibold tabular-nums", FEED_TONE_TEXT[row.tone])}>{row.figure}</span>
      </p>
      {row.action ? <Primary className="mt-1 max-w-full self-start truncate">{row.action}</Primary> : null}
    </Node>
  );
}

function AlertNode({ row }: { row: AlertRow }) {
  return (
    <Node marker={<Dot className={cn(DOT[row.severity], SEVERITY_FILL[row.severity])} />}>
      <p className="text-sm leading-snug tracking-tight">
        <span className="font-semibold">{row.metric}</span> {row.subject} <Delta value={row.figure.delta} tone={row.figure.tone} className="whitespace-nowrap" />
      </p>
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate text-xs text-muted-foreground">
          <span className="tabular-nums">{row.figure.value}</span> · {row.owner}
        </span>
        <Primary>{row.action}</Primary>
      </div>
    </Node>
  );
}

function FoldNode({ counts, total }: { counts: { severity: Severity; count: number }[]; total: number }) {
  return (
    <li className="relative -ml-10 flex items-center gap-3 rounded-xl py-1 pl-10 text-xs hover:bg-muted">
      <span aria-hidden className="absolute left-[9px] top-1/2 flex -translate-y-1/2 flex-col items-center gap-0.5 bg-card py-1">
        {counts.map(({ severity }) => (
          <span key={severity} className={cn("size-1.5 rounded-full", SEVERITY_FILL[severity])} />
        ))}
      </span>
      <span className="font-medium">{TH.inboxRows.foldMore(total)}</span>
      <span className="flex gap-2 tabular-nums text-muted-foreground">
        {counts.map(({ severity, count }) => (
          <span key={severity}>
            {TH.severity[severity]} {count}
          </span>
        ))}
      </span>
    </li>
  );
}

function GapBars({ figure }: { figure: Figure }) {
  const ratio = gapRatio(figure.delta);
  if (ratio === null) return null;
  const widest = Math.max(1, ratio);
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1.5 text-xs">
      <span className="text-muted-foreground">{TH.inboxRows.expectedLabel}</span>
      <span className="h-2 rounded-full bg-muted-foreground/25" style={{ width: `${(1 / widest) * PERCENT}%` }} />
      <span className="text-right tabular-nums text-muted-foreground">{figure.expected}</span>
      <span className="text-muted-foreground">{TH.inboxRows.now}</span>
      <span className={cn("h-2 rounded-full", figure.tone === "good" ? "bg-success" : figure.tone === "bad" ? "bg-danger" : "bg-muted-foreground")} style={{ width: `${(ratio / widest) * PERCENT}%` }} />
      <span className={cn("text-right font-display font-semibold tabular-nums", DELTA_TONE[figure.tone])}>{figure.value}</span>
    </div>
  );
}

function OpenedAlertNode({ row }: { row: AlertRow }) {
  return (
    <Rail>
      <Node marker={<Dot className={cn(DOT[row.severity], SEVERITY_FILL[row.severity])} />}>
        <span className="text-[11px] text-muted-foreground">{row.window}</span>
        <p className="text-base leading-snug tracking-tight">
          <span className="font-semibold">{row.metric}</span> {row.subject} <Delta value={row.figure.delta} tone={row.figure.tone} className="whitespace-nowrap" />
        </p>
        <div className="mt-2 flex flex-col gap-3">
          <GapBars figure={row.figure} />
          <Reason text={row.reason} />
          <div className="flex items-center gap-1">
            <Primary size="md">{row.action}</Primary>
            <CheckInChat />
            <span className="flex-1" />
            <MoreMenu items={row.menu} />
          </div>
        </div>
      </Node>
    </Rail>
  );
}

function primaryLabel(row: HandoffRow): string | null {
  if (!row.primary) return null;
  return row.primary === "accept" ? TH.inbox.accept : TH.handoff.close;
}

function HandoffHead({ row }: { row: HandoffRow }) {
  return (
    <>
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {TH.inboxRows.from(row.from)}
        {row.due ? (
          <span className="ml-1 flex items-center gap-1 text-danger">
            <Clock className="size-3" aria-hidden />
            {dueTimeTh(row.due)}
          </span>
        ) : null}
      </span>
      <p className="text-sm leading-snug tracking-tight">
        <span className="font-semibold">{row.title}</span> {row.figure ? <Delta value={row.figure.delta} tone={row.figure.tone} className="whitespace-nowrap" /> : null}
      </p>
    </>
  );
}

function HandoffNode({ row }: { row: HandoffRow }) {
  const label = primaryLabel(row);
  return (
    <Rail>
      <Node marker={<Initial name={row.from} urgent={row.urgent} />}>
        <HandoffHead row={row} />
        {label ? <Primary className="mt-1 self-start">{label}</Primary> : null}
      </Node>
    </Rail>
  );
}

function OpenedHandoffNode({ row, menuOpen }: { row: HandoffRow; menuOpen: boolean }) {
  const label = primaryLabel(row);
  return (
    <Rail>
      <Node marker={<Initial name={row.from} urgent={row.urgent} />}>
        <HandoffHead row={row} />
        <div className="mt-2 flex flex-col gap-3">
          <p className="line-clamp-2 text-[13px] leading-relaxed text-foreground/80">{row.ask}</p>
          {row.figure ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-muted-foreground">{row.evidence}</span>
              <GapBars figure={row.figure} />
            </div>
          ) : null}
          {row.primary === "close" ? (
            <>
              <OutcomeField />
              <Verdict />
            </>
          ) : null}
          <div className="flex items-center gap-1">
            {label ? <Primary size="md">{label}</Primary> : null}
            <CheckInChat />
            <span className="flex-1" />
            <MoreMenu items={row.menu} open={menuOpen} />
          </div>
        </div>
      </Node>
    </Rail>
  );
}

/** What Winyu found, in the order it found it, on a rail whose dots grow with urgency. */
export function DirectionC({ specimens }: { specimens: Specimens }) {
  const { alerts } = specimens;
  const days = alerts.urgent.map((row, index) => (index === 0 || formatDateTh(row.at) !== formatDateTh(alerts.urgent[index - 1].at) ? row.at : null));
  return (
    <>
      <Specimen label={S.todo(specimens.ceo)}>
        <Rail>
          {specimens.todo.map((row) => (
            <TodoNode key={row.key} row={row} />
          ))}
        </Rail>
      </Specimen>
      <Specimen label={S.alerts(specimens.ceo, specimens.alertCount)}>
        <Rail>
          {alerts.urgent.flatMap((row, index) => {
            const day = days[index];
            const node = <AlertNode key={row.id} row={row} />;
            return day ? [<DayMark key={`${row.id}-day`} at={day} />, node] : [node];
          })}
          {alerts.rest.length > 0 ? <FoldNode counts={alerts.restCounts} total={alerts.rest.length} /> : null}
        </Rail>
      </Specimen>
      {specimens.opened ? (
        <Specimen label={S.alertOpen}>
          <OpenedAlertNode row={specimens.opened} />
        </Specimen>
      ) : null}
      {specimens.handoff ? (
        <Specimen label={S.handoffNew(specimens.rep)}>
          <HandoffNode row={specimens.handoff} />
        </Specimen>
      ) : null}
      {specimens.handoff ? (
        <Specimen label={S.handoffNewOpen}>
          <OpenedHandoffNode row={specimens.handoff} menuOpen />
        </Specimen>
      ) : null}
      {specimens.accepted ? (
        <Specimen label={S.handoffAccepted}>
          <OpenedHandoffNode row={specimens.accepted} menuOpen={false} />
        </Specimen>
      ) : null}
    </>
  );
}
