import { METRIC_IDS, type Dim, type MetricId } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { adoptionSummary, percentOf } from "@/lib/server/adoption";
import { usageSummary, type UsageSummary } from "@/lib/server/usage";
import { SpendStat } from "./spend-stat";
import { EmptyLine, Panel, Stat } from "./parts";

const COPY = TH.admin.usage;
const ADOPTION = TH.admin.adoption;
const CHART_HEIGHT_PX = 160;
const TICK_EVERY = 3;

function intentLabel(intentKey: string): string {
  const [metric, ...dims] = intentKey.split("|");
  if (!METRIC_IDS.includes(metric as MetricId)) return intentKey;
  const by = dims.filter(Boolean).map((dim) => TH.dim[dim as Dim] ?? dim);
  return by.length > 0 ? `${metricLabel(metric as MetricId)} · ${by.join(", ")}` : metricLabel(metric as MetricId);
}

function QuestionsPerDay({ summary }: { summary: UsageSummary }) {
  const peak = Math.max(1, ...summary.perDay.map((point) => point.count));
  const peakIndex = summary.perDay.findIndex((point) => point.count === peak);
  const total = summary.perDay.reduce((sum, point) => sum + point.count, 0);
  return (
    <Panel title={COPY.perDay} hint={COPY.perDayHint} action={<p className="font-display text-2xl font-semibold tabular-nums">{total.toLocaleString("th-TH")}</p>} className="lg:col-span-2">
      <div className="relative flex items-end gap-[2px] border-b border-border" style={{ height: CHART_HEIGHT_PX }}>
        {summary.perDay.map((point, index) => (
          <div key={point.day} className="group relative flex h-full flex-1 items-end" title={`${formatDateTh(point.day)} · ${point.count.toLocaleString("th-TH")}`}>
            <div
              className="w-full rounded-t-[4px] bg-primary/75 transition group-hover:bg-primary"
              style={{ height: `${(point.count / peak) * 100}%`, minHeight: point.count > 0 ? 3 : 1 }}
            />
            {index === peakIndex && point.count > 0 ? (
              <span className="absolute left-1/2 -translate-x-1/2 -translate-y-5 text-[11px] font-medium tabular-nums text-foreground" style={{ bottom: `${(point.count / peak) * 100}%` }}>
                {point.count.toLocaleString("th-TH")}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[2px]">
        {summary.perDay.map((point, index) => (
          <span key={point.day} className="flex-1 text-center text-[10px] tabular-nums text-muted-foreground">
            {index % TICK_EVERY === 0 || index === summary.perDay.length - 1 ? point.day.slice(8) : ""}
          </span>
        ))}
      </div>
    </Panel>
  );
}

function ActiveByRole() {
  const adoption = adoptionSummary();
  return (
    <Panel title={ADOPTION.activeByRole} hint={ADOPTION.note}>
      <ul className="flex flex-col gap-2.5">
        {adoption.activeByRole.map((entry) => (
          <li key={entry.role} className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-3 text-sm" title={`${TH.role[entry.role]} · ${entry.active}/${entry.total}`}>
            <span className="truncate text-muted-foreground">{TH.role[entry.role]}</span>
            <span className="h-2 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${percentOf(entry.active, entry.total)}%` }} />
            </span>
            <span className="text-right text-xs tabular-nums text-muted-foreground">
              {entry.active}/{entry.total}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function AlertFate() {
  const adoption = adoptionSummary();
  const fate = adoption.alerts;
  const acted = percentOf(fate.total - fate.untouched, fate.total);
  const parts = [
    ["handedOff", fate.handedOff],
    ["closed", fate.closed],
    ["opened", fate.opened],
    ["untouched", fate.untouched],
  ] as const;
  return (
    <Panel title={ADOPTION.alerts}>
      <p className="font-display text-[2rem] font-semibold leading-none tracking-[-0.03em] tabular-nums">{ADOPTION.acted(acted)}</p>
      <p className="mt-1.5 text-xs text-muted-foreground">{ADOPTION.actedNote}</p>
      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {parts.map(([key, count]) => (
          <div key={key} className="rounded-2xl bg-muted/60 px-3 py-2.5">
            <dt className="text-[11px] text-muted-foreground">{ADOPTION[key]}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">{count}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 text-sm">
        <div>
          <p className="text-[11px] text-muted-foreground">{ADOPTION.handoffs}</p>
          <p className="mt-0.5">{ADOPTION.handoffLine(adoption.handoffs.resolved, adoption.handoffs.total, adoption.handoffs.returned)}</p>
          <p className="text-xs text-muted-foreground">{ADOPTION.replyTime(adoption.handoffs.medianHoursToReply)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">{ADOPTION.cards}</p>
          <p className="mt-0.5">{adoption.cards.judged ? ADOPTION.cardsLine(adoption.cards.viewed, adoption.cards.pinned) : ADOPTION.cardsWaiting}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">{ADOPTION.watches}</p>
          <p className="mt-0.5">{ADOPTION.watchLine(adoption.watches.active, adoption.watches.triggered, adoption.watches.notified, adoption.watches.digests)}</p>
        </div>
      </div>
    </Panel>
  );
}

export function UsageTab() {
  const summary = usageSummary();
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={COPY.questions} value={summary.questions.toLocaleString("th-TH")} tone="primary" />
        <Stat label={COPY.tools} value={summary.toolCalls.toLocaleString("th-TH")} />
        <Stat label={COPY.denied} value={summary.denied.toLocaleString("th-TH")} sub={`${COPY.masked} ${summary.masked.toLocaleString("th-TH")} · ${COPY.empty} ${summary.emptyResults.toLocaleString("th-TH")}`} tone={summary.denied > 0 ? "danger" : "neutral"} href="/admin?tab=audit&decision=deny" />
        <SpendStat spend={summary.spend} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <QuestionsPerDay summary={summary} />
        <Panel title={COPY.topIntents}>
          {summary.topIntents.length === 0 ? (
            <EmptyLine text={COPY.none} />
          ) : (
            <ol className="flex flex-col gap-2">
              {summary.topIntents.map((intent, index) => (
                <li key={intent.intentKey} className="flex items-center gap-3 text-sm">
                  <span className="w-4 text-right text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate" title={intent.intentKey}>{intentLabel(intent.intentKey)}</span>
                  <span className="tabular-nums text-muted-foreground">{intent.count}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ActiveByRole />
        <AlertFate />
      </div>

      <Panel title={COPY.unanswered} hint={COPY.unansweredNote}>
        {summary.unanswered.length === 0 ? (
          <EmptyLine text={COPY.none} />
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {summary.unanswered.map((question) => (
              <li key={`${question.at}-${question.prompt}`} className="rounded-2xl border border-border px-3.5 py-2.5">
                <p className="line-clamp-2 text-sm">{question.prompt}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{findUser(question.userId)?.nameTh ?? question.userId}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
