import { ChevronDown, Clock } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { dueTimeTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { CheckInChat, Delta, FEED_TONE_FILL, FEED_TONE_TEXT, MoreMenu, OutcomeField, Primary, Reason, SEVERITY_FILL, Specimen, Verdict } from "./parts";
import type { AlertRow, HandoffRow, Severity, Specimens, TodoRow } from "./rows";

const S = TH.inboxRows.sections;
const BAR_WEIGHT: Record<Severity, string> = { P1: "w-1", P2: "w-[3px]", P3: "w-0.5 opacity-60" };
const ROW = "relative flex items-center gap-3 py-2.5 pl-4 pr-2";

function Bar({ className }: { className: string }) {
  return <span aria-hidden className={cn("absolute inset-y-2 left-0 rounded-r-full", className)} />;
}

function TodoLine({ row }: { row: TodoRow }) {
  return (
    <li className={ROW}>
      <Bar className={cn("w-[3px]", FEED_TONE_FILL[row.tone])} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold tracking-tight">{row.title}</p>
        {row.detail ? <p className="truncate text-xs text-muted-foreground">{row.detail}</p> : null}
      </div>
      <span className={cn("shrink-0 font-display text-sm font-semibold tabular-nums", FEED_TONE_TEXT[row.tone])}>{row.figure}</span>
      {row.action ? <Primary className="max-w-28 truncate">{row.action}</Primary> : null}
    </li>
  );
}

function AlertLine({ row, selected = false }: { row: AlertRow; selected?: boolean }) {
  return (
    <div className={cn(ROW, selected && "rounded-t-2xl bg-muted")}>
      <Bar className={cn(BAR_WEIGHT[row.severity], SEVERITY_FILL[row.severity])} />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm tracking-tight", row.severity === "P1" ? "font-semibold" : "font-medium")}>{row.subject}</p>
        <p className="truncate text-xs text-muted-foreground">
          {row.metric} · {row.owner}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end leading-tight">
        <Delta value={row.figure.delta} tone={row.figure.tone} className="text-sm" />
        <span className="text-[11px] tabular-nums text-muted-foreground">{row.figure.value}</span>
      </div>
      <Primary>{row.action}</Primary>
    </div>
  );
}

function Fold({ counts, total }: { counts: { severity: Severity; count: number }[]; total: number }) {
  return (
    <li className="flex items-center gap-3 py-2.5 pl-4 pr-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-2">
        {counts.map(({ severity, count }) => (
          <span key={severity} className="flex items-center gap-1 tabular-nums">
            <span aria-hidden className={cn("size-1.5 rounded-full", SEVERITY_FILL[severity])} />
            {count}
          </span>
        ))}
      </span>
      <span className="flex-1 font-medium text-foreground">{TH.inboxRows.foldMore(total)}</span>
      <ChevronDown className="size-4" aria-hidden />
    </li>
  );
}

function OpenedAlert({ row }: { row: AlertRow }) {
  return (
    <div>
      <AlertLine row={row} selected />
      <div className="flex flex-col gap-2 px-4 pb-3 pt-3">
        <span className="text-[11px] text-muted-foreground">{row.window}</span>
        <Reason text={row.reason} />
        <dl className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
          <div>
            <dt className="text-muted-foreground">{TH.inboxRows.now}</dt>
            <dd className="font-display text-base font-semibold tabular-nums">{row.figure.value}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{TH.inboxRows.expectedLabel}</dt>
            <dd className="font-display text-base tabular-nums text-muted-foreground">{row.figure.expected}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{TH.inboxRows.gap}</dt>
            <dd>
              <Delta value={row.figure.delta} tone={row.figure.tone} className="text-base" />
            </dd>
          </div>
        </dl>
        <div className="flex items-center gap-1">
          <Primary size="md">{row.action}</Primary>
          <CheckInChat />
          <span className="flex-1" />
          <MoreMenu items={row.menu} />
        </div>
      </div>
    </div>
  );
}

function HandoffLine({ row, selected = false }: { row: HandoffRow; selected?: boolean }) {
  return (
    <div className={cn(ROW, selected && "rounded-t-2xl bg-muted")}>
      <Bar className={cn("w-1", row.urgent ? "bg-danger" : "bg-warning")} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold tracking-tight">{row.title}</p>
        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
          {TH.inboxRows.from(row.from)}
          {row.due ? (
            <>
              <Clock className="ml-1 size-3" aria-hidden />
              {dueTimeTh(row.due)}
            </>
          ) : null}
        </p>
      </div>
      {row.figure ? <Delta value={row.figure.delta} tone={row.figure.tone} className="shrink-0 text-sm" /> : null}
      {row.primary ? <Primary>{row.primary === "accept" ? TH.inbox.accept : TH.handoff.close}</Primary> : null}
    </div>
  );
}

function OpenedHandoff({ row, menuOpen }: { row: HandoffRow; menuOpen: boolean }) {
  return (
    <div>
      <HandoffLine row={row} selected />
      <div className="flex flex-col gap-3 px-4 pb-3 pt-3">
        <p className="line-clamp-2 text-[13px] leading-relaxed text-foreground/80">{row.ask}</p>
        {row.figure ? (
          <p className="flex items-baseline gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
            <span className="text-foreground">{row.evidence}</span>
            <span className="font-display text-base font-semibold tabular-nums text-foreground">{row.figure.value}</span>
            {TH.inboxRows.expected(row.figure.expected ?? "")}
          </p>
        ) : null}
        {row.primary === "close" ? (
          <>
            <OutcomeField />
            <Verdict />
          </>
        ) : null}
        <div className="flex items-center gap-1">
          {row.primary ? <Primary size="md">{row.primary === "accept" ? TH.inbox.accept : TH.handoff.close}</Primary> : null}
          <CheckInChat />
          <span className="flex-1" />
          <MoreMenu items={row.menu} open={menuOpen} />
        </div>
      </div>
    </div>
  );
}

/** A dense list read top to bottom like a mail client. */
export function DirectionA({ specimens }: { specimens: Specimens }) {
  const { alerts } = specimens;
  return (
    <>
      <Specimen label={S.todo(specimens.ceo)} className="overflow-hidden">
        <ol className="divide-y divide-border">
          {specimens.todo.map((row) => (
            <TodoLine key={row.key} row={row} />
          ))}
        </ol>
      </Specimen>
      <Specimen label={S.alerts(specimens.ceo, specimens.alertCount)} className="overflow-hidden">
        <ol className="divide-y divide-border">
          {alerts.urgent.map((row) => (
            <li key={row.id}>
              <AlertLine row={row} />
            </li>
          ))}
          {alerts.rest.length > 0 ? <Fold counts={alerts.restCounts} total={alerts.rest.length} /> : null}
        </ol>
      </Specimen>
      {specimens.opened ? (
        <Specimen label={S.alertOpen}>
          <OpenedAlert row={specimens.opened} />
        </Specimen>
      ) : null}
      {specimens.handoff ? (
        <Specimen label={S.handoffNew(specimens.rep)} className="overflow-hidden">
          <HandoffLine row={specimens.handoff} />
        </Specimen>
      ) : null}
      {specimens.handoff ? (
        <Specimen label={S.handoffNewOpen}>
          <OpenedHandoff row={specimens.handoff} menuOpen />
        </Specimen>
      ) : null}
      {specimens.accepted ? (
        <Specimen label={S.handoffAccepted}>
          <OpenedHandoff row={specimens.accepted} menuOpen={false} />
        </Specimen>
      ) : null}
    </>
  );
}
