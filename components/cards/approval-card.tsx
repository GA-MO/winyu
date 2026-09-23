"use client";

import type { LucideIcon } from "lucide-react";
import { BellRing, Check, LayoutGrid, Mail, RefreshCw, Send, X } from "lucide-react";
import type { ApprovalRequest, RenderApproval } from "vexa/react";
import type { MetricQuery, Urgency, WatchCondition } from "@/lib/contracts";
import { conditionLabel } from "@/lib/engine/personal-watches";
import { findUser } from "@/lib/data/entities/users";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { displayLabel } from "@/lib/semantic/dictionary";
import { TH } from "@/lib/i18n/th";

const MAX_EVIDENCE_LABELS = 2;
const URGENCY_BADGE: Record<Urgency, string> = {
  high: "bg-danger/10 text-danger",
  medium: "bg-warning/12 text-warning",
  low: "bg-muted text-muted-foreground",
};
const CONFIRM =
  "inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-ink-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CANCEL =
  "inline-flex items-center rounded-full border border-border bg-card px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:border-foreground/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Decision = {
  icon: LucideIcon;
  title: string;
  person: string | null;
  subjectLabel: string;
  subject: string | null;
  body: { label: string; text: string } | null;
  chips: string[];
  urgency: Urgency | null;
  effect: string;
  confirm: string;
  cancel: string;
  done: string;
};

type HandoffInput = { toUserId?: string; title?: string; ask?: string; urgency?: string; evidence?: MetricQuery[]; alertIds?: string[] };
type EmailInput = { toUserId?: string; subject?: string; body?: string };
type PinInput = { title?: string; query?: MetricQuery };
type JobInput = { job?: string };
type WatchInput = { title?: string; query?: MetricQuery; condition?: WatchCondition };

function personLine(userId: string | undefined): { name: string; line: string | null } {
  const user = userId ? findUser(userId) : null;
  if (!user) return { name: userId ?? "", line: null };
  return { name: user.nameTh, line: `${user.title} · ${user.department}` };
}

function urgencyOf(value: string | undefined): Urgency | null {
  if (value === "high" || value === "medium" || value === "low") return value;
  return null;
}

function scopeOf(query: MetricQuery): string {
  const dims = Object.entries(query.filters ?? {})
    .flatMap(([dim, values]) => (values ?? []).map((value) => displayLabel(dim as never, value)))
    .slice(0, MAX_EVIDENCE_LABELS);
  return [metricLabel(query.metric), ...dims].join(" · ");
}

function evidenceChips(input: HandoffInput): string[] {
  const queries = input.evidence ?? [];
  const alerts = input.alertIds ?? [];
  const labels = queries.slice(0, MAX_EVIDENCE_LABELS).map(scopeOf);
  if (queries.length > MAX_EVIDENCE_LABELS) labels.push(TH.approve.evidenceCount(queries.length));
  if (alerts.length > 0) labels.push(TH.approve.alertCount(alerts.length));
  return labels;
}

function handoffDecision(input: HandoffInput): Decision {
  const person = personLine(input.toUserId);
  return {
    icon: Send,
    title: TH.approve.handoffDone(person.name),
    person: person.line,
    subjectLabel: TH.approve.subject,
    subject: input.title ?? null,
    body: input.ask ? { label: TH.approve.askLabel, text: input.ask } : null,
    chips: evidenceChips(input),
    urgency: urgencyOf(input.urgency),
    effect: TH.approve.effectHandoff(person.name),
    confirm: TH.approve.confirmHandoff,
    cancel: TH.approve.cancelSend,
    done: TH.approve.doneHandoff(person.name),
  };
}

function emailDecision(input: EmailInput): Decision {
  const person = personLine(input.toUserId);
  return {
    icon: Mail,
    title: TH.approve.emailDone(person.name),
    person: person.line,
    subjectLabel: TH.approve.subject,
    subject: input.subject ?? null,
    body: input.body ? { label: TH.approve.messageLabel, text: input.body } : null,
    chips: [],
    urgency: null,
    effect: TH.approve.effectEmail(person.name),
    confirm: TH.approve.confirmEmail,
    cancel: TH.approve.cancelSend,
    done: TH.approve.doneEmail(person.name),
  };
}

function pinDecision(input: PinInput): Decision {
  return {
    icon: LayoutGrid,
    title: TH.approve.pinDone,
    person: null,
    subjectLabel: TH.approve.card,
    subject: input.title ?? null,
    body: null,
    chips: [],
    urgency: null,
    effect: TH.approve.effectPin,
    confirm: TH.approve.confirmPin,
    cancel: TH.approve.cancelDo,
    done: TH.approve.donePin,
  };
}

function watchDecision(input: WatchInput): Decision {
  const condition = input.query && input.condition ? `${scopeOf(input.query)} ${conditionLabel(input.query, input.condition)}` : null;
  return {
    icon: BellRing,
    title: TH.approve.watchDone,
    person: null,
    subjectLabel: TH.approve.subject,
    subject: input.title ?? null,
    body: condition ? { label: TH.approve.conditionLabel, text: condition } : null,
    chips: [],
    urgency: null,
    effect: TH.approve.effectWatch,
    confirm: TH.approve.confirmWatch,
    cancel: TH.approve.cancelDo,
    done: TH.approve.doneWatch,
  };
}

function jobDecision(input: JobInput): Decision {
  const job = TH.approve.jobs[input.job ?? ""] ?? input.job ?? "";
  return {
    icon: RefreshCw,
    title: TH.approve.jobDone(job),
    person: null,
    subjectLabel: TH.approve.subject,
    subject: null,
    body: null,
    chips: [],
    urgency: null,
    effect: TH.approve.effectJob,
    confirm: TH.approve.confirmJob,
    cancel: TH.approve.cancelDo,
    done: TH.approve.doneJob(job),
  };
}

function decisionOf(tool: string, input: unknown): Decision | null {
  const value = (input ?? {}) as Record<string, unknown>;
  if (tool === "create_handoff") return handoffDecision(value);
  if (tool === "send_email") return emailDecision(value);
  if (tool === "pin_widget") return pinDecision(value);
  if (tool === "watch_metric") return watchDecision(value);
  if (tool === "run_job") return jobDecision(value);
  return null;
}

function Receipt({ decision, approved }: { decision: Decision; approved: boolean }) {
  const Icon = approved ? Check : X;
  return (
    <section className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-card">
      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${approved ? "bg-success/12 text-success" : "bg-muted text-muted-foreground"}`}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className={`text-sm font-medium ${approved ? "" : "text-muted-foreground"}`}>{approved ? decision.done : TH.approve.notDone}</p>
        {decision.subject ? <p className="truncate text-xs text-muted-foreground">{decision.subject}</p> : null}
      </div>
    </section>
  );
}

function DecisionCard({ decision, request }: { decision: Decision; request: ApprovalRequest }) {
  const Icon = decision.icon;
  return (
    <section className="w-full overflow-hidden rounded-2xl border border-border bg-card shadow-lift animate-hero-rise">
      <header className="flex items-start gap-3 border-b border-border bg-muted/40 px-4 py-3.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-ink text-ink-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground">{TH.approve.waiting}</p>
          <h3 className="truncate text-[15px] font-semibold tracking-tight">{decision.title}</h3>
          {decision.person ? <p className="truncate text-xs text-muted-foreground">{decision.person}</p> : null}
        </div>
        {decision.urgency ? (
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${URGENCY_BADGE[decision.urgency]}`}>
            {TH.inbox.urgency[decision.urgency]}
          </span>
        ) : null}
      </header>

      <div className="flex flex-col gap-3 px-4 py-4">
        {decision.subject ? (
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">{decision.subjectLabel}</p>
            <p className="mt-0.5 text-sm font-medium wrap-anywhere">{decision.subject}</p>
          </div>
        ) : null}

        {decision.body ? (
          <div className="min-w-0 rounded-xl bg-muted px-3.5 py-3">
            <p className="text-[11px] text-muted-foreground">{decision.body.label}</p>
            <p className="mt-1 text-sm leading-relaxed wrap-anywhere">{decision.body.text}</p>
          </div>
        ) : null}

        {decision.chips.length > 0 ? (
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="text-[11px] text-muted-foreground">{TH.approve.attached}</p>
            <div className="flex flex-wrap gap-1.5">
              {decision.chips.map((chip) => (
                <span key={chip} className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
                  {chip}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <p className="text-xs leading-relaxed text-muted-foreground">{decision.effect}</p>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
        <p className="text-[11px] text-muted-foreground">{TH.approve.guard}</p>
        <div className="flex gap-2">
          <button type="button" className={CANCEL} onClick={request.reject}>
            {decision.cancel}
          </button>
          <button type="button" className={CONFIRM} onClick={request.approve}>
            <Check className="size-4" aria-hidden />
            {decision.confirm}
          </button>
        </div>
      </footer>
    </section>
  );
}

/** The one decision a CEO has to make, drawn by Cop: who gets the work, what it asks, what approving does. */
export const renderCopApproval: RenderApproval = (request) => {
  const decision = decisionOf(request.tool, request.input);
  if (!decision) return null;
  if (request.approved !== null) return <Receipt approved={request.approved} decision={decision} />;
  if (request.state !== "approval-requested") return null;
  return <DecisionCard decision={decision} request={request} />;
};
