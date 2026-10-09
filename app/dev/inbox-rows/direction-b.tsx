import { ChevronDown, Clock } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { dueTimeTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { CheckInChat, Delta, FEED_TONE_TEXT, FEED_TONE_TINT, MoreMenu, OutcomeField, Primary, Reason, SEVERITY_FILL, SEVERITY_TINT, Specimen, Verdict } from "./parts";
import type { AlertRow, HandoffRow, Severity, Specimens, TodoRow } from "./rows";

const S = TH.inboxRows.sections;
const TILE = "flex min-w-0 flex-col gap-1.5 rounded-xl p-3";
const HERO = "col-span-2";

function TodoTile({ row, hero }: { row: TodoRow; hero: boolean }) {
  return (
    <article className={cn(TILE, FEED_TONE_TINT[row.tone], hero && HERO)}>
      <span className={cn("font-display font-semibold leading-none tracking-tight tabular-nums", FEED_TONE_TEXT[row.tone], hero ? "text-3xl" : "text-xl")}>{row.figure}</span>
      <p className={cn("text-sm font-semibold tracking-tight", hero ? "line-clamp-1" : "line-clamp-2")}>{row.title}</p>
      {row.action ? <Primary className="mt-auto max-w-full self-start truncate">{row.action}</Primary> : null}
    </article>
  );
}

function AlertTile({ row, hero }: { row: AlertRow; hero: boolean }) {
  return (
    <article className={cn(TILE, SEVERITY_TINT[row.severity], hero && HERO)}>
      <div className="flex items-baseline gap-2">
        <Delta value={row.figure.delta} tone={row.figure.tone} className={cn("leading-none tracking-tight", hero ? "text-4xl" : "text-2xl")} />
        <span className="truncate text-[11px] tabular-nums text-muted-foreground">{row.figure.value}</span>
      </div>
      <p className="line-clamp-1 text-sm font-semibold tracking-tight">{row.subject}</p>
      <p className="truncate text-[11px] text-muted-foreground">
        {row.metric} · {row.owner}
      </p>
      <Primary className="mt-1 self-start">{row.action}</Primary>
    </article>
  );
}

function FoldStrip({ rows, counts }: { rows: AlertRow[]; counts: { severity: Severity; count: number }[] }) {
  return (
    <button type="button" className="col-span-2 flex flex-col gap-2 rounded-xl bg-muted px-3 py-2.5 text-left">
      <span className="flex items-center gap-2 text-xs">
        <span className="flex-1 font-medium">{TH.inboxRows.foldMore(rows.length)}</span>
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
      </span>
      <span className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full">
        {counts.map(({ severity, count }) => (
          <span key={severity} style={{ flexGrow: count }} className={cn("h-full", SEVERITY_FILL[severity], severity === "P3" && "opacity-50")} />
        ))}
      </span>
      <span className="flex gap-3 text-[11px] tabular-nums text-muted-foreground">
        {counts.map(({ severity, count }) => (
          <span key={severity}>
            {TH.severity[severity]} {count}
          </span>
        ))}
      </span>
    </button>
  );
}

function OpenedAlertTile({ row }: { row: AlertRow }) {
  return (
    <article className="flex flex-col gap-3 p-4">
      <div className={cn("flex flex-col gap-1 rounded-xl p-4", SEVERITY_TINT[row.severity])}>
        <Delta value={row.figure.delta} tone={row.figure.tone} className="text-5xl leading-none tracking-tight" />
        <p className="mt-2 text-sm font-semibold tracking-tight">{row.subject}</p>
        <p className="text-xs text-muted-foreground">
          <span className="font-display font-semibold tabular-nums text-foreground">{row.figure.value}</span> {TH.inboxRows.expected(row.figure.expected ?? "")} · {row.window}
        </p>
      </div>
      <Reason text={row.reason} />
      <Primary size="md" className="w-full">
        {row.action}
      </Primary>
      <div className="flex items-center">
        <CheckInChat />
        <span className="flex-1 text-right text-[11px] text-muted-foreground">{TH.inboxRows.owner(row.owner)}</span>
        <MoreMenu items={row.menu} />
      </div>
    </article>
  );
}

function primaryLabel(row: HandoffRow): string | null {
  if (!row.primary) return null;
  return row.primary === "accept" ? TH.inbox.accept : TH.handoff.close;
}

function HandoffTile({ row }: { row: HandoffRow }) {
  const label = primaryLabel(row);
  return (
    <article className={cn(TILE, "m-3", row.urgent ? "bg-danger/[0.07]" : "bg-warning/[0.08]")}>
      <div className="flex items-baseline gap-2">
        {row.figure ? <Delta value={row.figure.delta} tone={row.figure.tone} className="text-3xl leading-none tracking-tight" /> : null}
        {row.due ? (
          <span className="ml-auto flex items-center gap-1 text-[11px] text-danger">
            <Clock className="size-3" aria-hidden />
            {dueTimeTh(row.due)}
          </span>
        ) : null}
      </div>
      <p className="text-sm font-semibold tracking-tight">{row.title}</p>
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate text-[11px] text-muted-foreground">{TH.inboxRows.from(row.from)}</span>
        {label ? <Primary>{label}</Primary> : null}
      </div>
    </article>
  );
}

function OpenedHandoffTile({ row, menuOpen }: { row: HandoffRow; menuOpen: boolean }) {
  const label = primaryLabel(row);
  return (
    <article className="flex flex-col gap-3 p-4">
      <div className={cn("flex flex-col gap-1 rounded-xl p-4", row.urgent ? "bg-danger/[0.07]" : "bg-warning/[0.08]")}>
        {row.figure ? <Delta value={row.figure.delta} tone={row.figure.tone} className="text-5xl leading-none tracking-tight" /> : null}
        <p className="mt-2 text-sm font-semibold tracking-tight">{row.title}</p>
        {row.figure ? (
          <p className="text-xs text-muted-foreground">
            {row.evidence} <span className="font-display font-semibold tabular-nums text-foreground">{row.figure.value}</span> {TH.inboxRows.expected(row.figure.expected ?? "")}
          </p>
        ) : null}
      </div>
      <p className="line-clamp-2 text-[13px] leading-relaxed text-foreground/80">{row.ask}</p>
      {row.primary === "close" ? (
        <>
          <OutcomeField />
          <Verdict />
        </>
      ) : null}
      {label ? (
        <Primary size="md" className="w-full">
          {label}
        </Primary>
      ) : null}
      <div className="flex items-center">
        <CheckInChat />
        <span className="flex-1 truncate text-right text-[11px] text-muted-foreground">
          {TH.inboxRows.from(row.from)}
          {row.due ? ` · ${dueTimeTh(row.due)}` : ""}
        </span>
        <MoreMenu items={row.menu} open={menuOpen} />
      </div>
    </article>
  );
}

/** The number is the headline of every tile; the words only explain it. */
export function DirectionB({ specimens }: { specimens: Specimens }) {
  const { alerts } = specimens;
  return (
    <>
      <Specimen label={S.todo(specimens.ceo)} className="grid grid-cols-2 gap-2 p-3">
        {specimens.todo.map((row, index) => (
          <TodoTile key={row.key} row={row} hero={index === 0} />
        ))}
      </Specimen>
      <Specimen label={S.alerts(specimens.ceo, specimens.alertCount)} className="grid grid-cols-2 gap-2 p-3">
        {alerts.urgent.map((row, index) => (
          <AlertTile key={row.id} row={row} hero={index === 0 && alerts.urgent.length % 2 === 1} />
        ))}
        {alerts.rest.length > 0 ? <FoldStrip rows={alerts.rest} counts={alerts.restCounts} /> : null}
      </Specimen>
      {specimens.opened ? (
        <Specimen label={S.alertOpen}>
          <OpenedAlertTile row={specimens.opened} />
        </Specimen>
      ) : null}
      {specimens.handoff ? (
        <Specimen label={S.handoffNew(specimens.rep)}>
          <HandoffTile row={specimens.handoff} />
        </Specimen>
      ) : null}
      {specimens.handoff ? (
        <Specimen label={S.handoffNewOpen}>
          <OpenedHandoffTile row={specimens.handoff} menuOpen />
        </Specimen>
      ) : null}
      {specimens.accepted ? (
        <Specimen label={S.handoffAccepted}>
          <OpenedHandoffTile row={specimens.accepted} menuOpen={false} />
        </Specimen>
      ) : null}
    </>
  );
}
