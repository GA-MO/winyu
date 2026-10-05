import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { CircleCheck, CircleX, Flag, Gauge, Hand, Layers, LayoutTemplate, MousePointerClick, Scissors, Sparkles, Wrench } from "lucide-react";
import { cn } from "@/components/ui/cn";
import type { AuditEntry } from "@/lib/contracts";
import type { ContextRef } from "@/lib/harness/events";
import type { RunRecord } from "@/lib/harness/runtime";
import type { RunSpend } from "@/lib/server/model-ledger";
import { stateOf } from "@/lib/harness/state";
import { timelineOf, type TimelineEntry, type ToolStory } from "@/lib/harness/timeline";
import { TH } from "@/lib/i18n/th";
import { toolLabel } from "@/lib/server/tools/registry";
import { FOCUS, Pill, type Tone } from "./parts";

const COPY = TH.admin.trace;
const CODES = TH.admin.auditTab.codes;
const MS_PER_SECOND = 1000;
const JOB_INTENT_PREFIX = "job:";

const ICON_TONE: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success/12 text-success",
  warning: "bg-warning/14 text-warning",
  danger: "bg-danger/10 text-danger",
  primary: "bg-primary/10 text-primary",
};

type Line = { icon: LucideIcon; tone: Tone; title: string; detail?: React.ReactNode };

function seconds(ms: number): string {
  return (ms / MS_PER_SECOND).toLocaleString("th-TH", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
}

function toolsText(names: readonly string[]): string {
  return names.map(toolLabel).join(", ");
}

function codeText(code: string): string {
  return CODES[code] ?? code;
}

function toolTone(story: ToolStory): Tone {
  if (story.denied || story.verdict?.passed === false || story.recovery.some((step) => step.action === "withhold")) return "danger";
  if (story.outcome?.status === "failed") return "warning";
  if (story.outcome?.status === "partial") return "warning";
  return "success";
}

function kindsOf(items: readonly ContextRef[]): { kind: string; items: ContextRef[] }[] {
  const groups = new Map<string, ContextRef[]>();
  for (const item of items) groups.set(item.kind, [...(groups.get(item.kind) ?? []), item]);
  return [...groups].map(([kind, grouped]) => ({ kind, items: grouped }));
}

function ToolDetail({ story, args }: { story: ToolStory; args: string | null }) {
  const evidence = story.outcome?.evidence;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {story.denied ? <Pill tone="danger">{`${COPY.gate.denied} · ${codeText(story.denied.code)}`}</Pill> : null}
        {story.denied?.rule ? (
          <Link href="/admin?tab=rules" className={cn("rounded-full", FOCUS)}>
            <Pill tone="danger" title={story.denied.rule.id}>{COPY.rule(story.denied.rule.name)}</Pill>
          </Link>
        ) : null}
        {story.approval ? <Pill tone={story.approval === "required" ? "primary" : "success"}>{COPY.gate[story.approval]}</Pill> : null}
        {story.outcome ? (
          <Pill tone={story.outcome.status === "success" ? "success" : "warning"}>
            {[COPY.outcome[story.outcome.status], evidence ? COPY.rows(evidence.rows) : null, evidence?.code ? codeText(evidence.code) : null].filter(Boolean).join(" · ")}
          </Pill>
        ) : null}
        {evidence && evidence.masked.length > 0 ? <Pill tone="warning">{COPY.masked(evidence.masked.join(", "))}</Pill> : null}
        {story.attempts > 1 ? <Pill>{COPY.attempts(story.attempts)}</Pill> : null}
        {story.verdict ? <Pill tone={story.verdict.passed ? "success" : "danger"}>{story.verdict.passed ? COPY.verified : COPY.unverified}</Pill> : null}
        {story.recovery.map((step, index) => (
          <Pill key={index} tone={step.action === "withhold" ? "danger" : step.action === "correct" ? "primary" : "neutral"} title={step.reason}>
            {COPY.recovery[step.action]}
          </Pill>
        ))}
      </div>
      {story.recovery.flatMap((step, index) => (step.fix ? [<p key={`fix-${index}`} className="rounded-xl bg-primary/5 px-2.5 py-1.5 text-[12px] text-foreground/80">{step.fix}</p>] : []))}
      {story.verdict?.passed ? <p className="text-[11px] text-muted-foreground">{story.verdict.checks.map((check) => COPY.checks[check] ?? check).join(" · ")}</p> : null}
      {story.verdict && !story.verdict.passed ? <p className="text-[12px] text-danger">{story.verdict.reason}</p> : null}
      {story.denied ? <p className="text-[12px] text-danger">{story.denied.reason}</p> : null}
      {evidence?.reason ? <p className="text-[12px] text-foreground/80">{evidence.reason}</p> : null}
      {args ? <p className="break-all font-mono text-[11px] text-muted-foreground">{args}</p> : null}
    </div>
  );
}

function lineOf(entry: TimelineEntry, argsOf: (toolCallId: string) => string | null): Line {
  switch (entry.kind) {
    case "start":
      return { icon: Flag, tone: "primary", title: entry.goal.intent?.startsWith(JOB_INTENT_PREFIX) ? COPY.startJob : COPY.start, detail: entry.goal.userMessage ? `“${entry.goal.userMessage}”` : null };
    case "pressed":
      return { icon: MousePointerClick, tone: "primary", title: COPY.pressed(toolLabel(entry.tool)) };
    case "answered":
      return { icon: Hand, tone: entry.approved ? "success" : "warning", title: COPY.answered(toolLabel(entry.tool), entry.approved) };
    case "context":
      return {
        icon: Layers,
        tone: "neutral",
        title: COPY.context(entry.items.length),
        detail: (
          <div className="flex flex-wrap gap-1">
            {kindsOf(entry.items).map(({ kind, items }) => (
              <Pill key={kind} title={items.map((item) => `${item.source} · priority ${item.priority} · ${item.chars} chars${item.scope ? ` · ${item.scope}` : ""}`).join("\n")}>
                {COPY.contextKinds[kind] ?? kind}
              </Pill>
            ))}
            {entry.dropped.length > 0 ? <Pill tone="warning">{COPY.contextDropped(entry.dropped.length)}</Pill> : null}
          </div>
        ),
      };
    case "trimmed":
      return { icon: Scissors, tone: "neutral", title: COPY.trimmed(entry.dropped, entry.kept) };
    case "step":
      return { icon: Sparkles, tone: "primary", title: COPY.step(entry.step), detail: entry.toolCalls.length > 0 ? COPY.stepAsks(toolsText(entry.toolCalls)) : entry.finishReason ? COPY.stepAnswers : null };
    case "tool":
      return { icon: Wrench, tone: toolTone(entry), title: toolLabel(entry.tool), detail: <ToolDetail story={entry} args={argsOf(entry.toolCallId)} /> };
    case "asked":
      return { icon: Hand, tone: "warning", title: COPY.asked(toolLabel(entry.tool)) };
    case "limited":
      return { icon: Gauge, tone: "warning", title: COPY.limited[entry.limit], detail: COPY.limitedDetail(entry.step) };
    case "rendered":
      return { icon: LayoutTemplate, tone: "success", title: COPY.rendered(entry.components.join(", ")) };
    case "end":
      return entry.ok ? { icon: CircleCheck, tone: "success", title: COPY.completed } : { icon: CircleX, tone: "danger", title: COPY.failed(entry.reason) };
  }
}

/** The run behind one question in the audit, as the steps the AI took: what it was told, what it asked for, what the harness allowed, observed, checked and did next. */
export function RunTrace({ record, audit, spend }: { record: RunRecord; audit: readonly AuditEntry[]; spend?: RunSpend }) {
  const state = stateOf(record.id, record.events);
  const startedAt = Date.parse(record.startedAt);
  const duration = Date.parse(record.endedAt) - startedAt;
  const argsOf = (toolCallId: string) => audit.find((entry) => entry.toolCallId === toolCallId)?.args ?? null;
  const tone: Tone = state.phase === "failed" ? "danger" : state.phase === "awaiting_approval" ? "warning" : "success";
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{COPY.heading}</p>
        <span className="flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
          {COPY.summary(state.step, Object.keys(state.toolCalls).length, seconds(duration))}
          {spend && spend.calls > 0 ? <span>{COPY.spend(spend.calls, (spend.inputTokens + spend.outputTokens).toLocaleString("th-TH"), spend.usd.toFixed(4))}</span> : null}
          <Pill tone={tone}>{COPY.phase[state.phase]}</Pill>
        </span>
      </header>
      <ol className="relative flex flex-col gap-3 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-border">
        {timelineOf(record.events).map((entry, index) => {
          const line = lineOf(entry, argsOf);
          const Icon = line.icon;
          return (
            <li key={index} className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-2.5">
              <span className={cn("relative z-10 flex size-7 items-center justify-center rounded-full ring-4 ring-card", ICON_TONE[line.tone])}>
                <Icon className="size-3.5" aria-hidden />
              </span>
              <div className="min-w-0 pt-1">
                <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-[13px]">
                  <span className="font-medium">{line.title}</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{COPY.at(seconds(Date.parse(entry.at) - startedAt))}</span>
                </p>
                {line.detail ? <div className="mt-1 text-[12px] text-muted-foreground">{line.detail}</div> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
