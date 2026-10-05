"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { BellRing, CalendarDays, Check, GraduationCap, LayoutGrid, Mail, RefreshCw, Send, ShieldCheck, X } from "lucide-react";
import { METRIC_IDS, ROLE_IDS, type MetricId, type MetricQuery, type RoleId, type Urgency, type WatchCondition } from "@/lib/contracts";
import { conditionLabel } from "@/lib/engine/personal-watches";
import { USERS, findUser } from "@/lib/data/entities/users";
import { formatDateTh } from "@/lib/i18n/format";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";

const COURSES_ENDPOINT = "/api/courses";
const PERMISSION_LABEL_ENDPOINT = "/api/permissions/label";
const LABELS_ENDPOINT = "/api/labels";
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

/** A write tool call waiting for the user: `approved` is null until they decide. */
export type ApprovalRequest = {
  tool: string;
  input: unknown;
  approved: boolean | null;
  approve: () => void;
  reject: () => void;
};

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
type PermissionInput = { role?: string; kind?: string; key?: string; value?: string };
type LeaveInput = { kind?: string; from?: string; to?: string; reason?: string };
type EnrollInput = { courseId?: string };
type CourseSummary = { id: string; title: string; starts: string; days: number };

const PERMISSION_VALUE_LABEL: Record<string, string> = {
  full: TH.admin.acl.full,
  masked: TH.admin.acl.masked,
  none: TH.admin.acl.none,
  allow: TH.admin.permission.allow,
  deny: TH.admin.permission.deny,
};

function personLine(userId: string | undefined): { name: string; line: string | null } {
  const user = userId ? findUser(userId) : null;
  if (!user) return { name: userId ?? "", line: null };
  return { name: user.nameTh, line: `${user.title} · ${user.department}` };
}

function urgencyOf(value: string | undefined): Urgency | null {
  if (value === "high" || value === "medium" || value === "low") return value;
  return null;
}

type Labels = Record<string, string>;

function labelKeysOf(query: MetricQuery): string[] {
  return Object.entries(query.filters ?? {}).flatMap(([dim, values]) => (values ?? []).map((value) => `${dim}:${value}`));
}

function scopeOf(query: MetricQuery, labels: Labels): string {
  const dims = Object.entries(query.filters ?? {})
    .flatMap(([dim, values]) => (values ?? []).map((value) => labels[`${dim}:${value}`] ?? value))
    .slice(0, MAX_EVIDENCE_LABELS);
  return [metricLabel(query.metric), ...dims].join(" · ");
}

function evidenceChips(input: HandoffInput, names: Labels): string[] {
  const queries = input.evidence ?? [];
  const alerts = input.alertIds ?? [];
  const labels = queries.slice(0, MAX_EVIDENCE_LABELS).map((query) => scopeOf(query, names));
  if (queries.length > MAX_EVIDENCE_LABELS) labels.push(TH.approve.evidenceCount(queries.length));
  if (alerts.length > 0) labels.push(TH.approve.alertCount(alerts.length));
  return labels;
}

function handoffDecision(input: HandoffInput, labels: Labels): Decision {
  const person = personLine(input.toUserId);
  return {
    icon: Send,
    title: TH.approve.handoffDone(person.name),
    person: person.line,
    subjectLabel: TH.approve.subject,
    subject: input.title ?? null,
    body: input.ask ? { label: TH.approve.askLabel, text: input.ask } : null,
    chips: evidenceChips(input, labels),
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

function watchDecision(input: WatchInput, labels: Labels): Decision {
  const condition = input.query && input.condition ? `${scopeOf(input.query, labels)} ${conditionLabel(input.query, input.condition)}` : null;
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

function roleOf(value: string | undefined): RoleId | null {
  return ROLE_IDS.includes(value as RoleId) ? (value as RoleId) : null;
}

function permissionSubject(input: PermissionInput, label: string | null): string {
  const key = input.key ?? "";
  if (label) return label;
  return input.kind === "metric" && METRIC_IDS.includes(key as MetricId) ? metricLabel(key as MetricId) : key;
}

function permissionDecision(input: PermissionInput, label: string | null): Decision {
  const role = roleOf(input.role);
  const roleLabel = role ? TH.role[role] : (input.role ?? "");
  const people = role ? USERS.filter((user) => user.role === role).length : 0;
  return {
    icon: ShieldCheck,
    title: TH.approve.permissionDone(roleLabel),
    person: TH.approve.permissionPeople(people),
    subjectLabel: TH.approve.permissionChange,
    subject: `${permissionSubject(input, label)} → ${PERMISSION_VALUE_LABEL[input.value ?? ""] ?? input.value ?? ""}`,
    body: null,
    chips: [],
    urgency: null,
    effect: TH.approve.effectPermission,
    confirm: TH.approve.confirmPermission,
    cancel: TH.approve.cancelDo,
    done: TH.approve.donePermission(roleLabel),
  };
}

function leaveRange(input: LeaveInput): string | null {
  if (!input.from || !input.to) return null;
  return TH.leave.range(formatDateTh(input.from), formatDateTh(input.to));
}

function leaveDecision(input: LeaveInput): Decision {
  const kind = TH.leave.kind[input.kind ?? ""] ?? input.kind ?? "";
  return {
    icon: CalendarDays,
    title: TH.approve.leaveDone(kind),
    person: null,
    subjectLabel: TH.approve.leaveRange,
    subject: leaveRange(input),
    body: input.reason ? { label: TH.approve.reasonLabel, text: input.reason } : null,
    chips: [],
    urgency: null,
    effect: TH.approve.effectLeave,
    confirm: TH.approve.confirmLeave,
    cancel: TH.approve.cancelSend,
    done: TH.approve.doneLeave(kind),
  };
}

function enrollDecision(input: EnrollInput, course: CourseSummary | null): Decision {
  return {
    icon: GraduationCap,
    title: TH.approve.enrollDone,
    person: course ? TH.courses.when(formatDateTh(course.starts), course.days) : null,
    subjectLabel: TH.approve.course,
    subject: course?.title ?? null,
    body: null,
    chips: [],
    urgency: null,
    effect: TH.approve.effectEnroll,
    confirm: TH.approve.confirmEnroll,
    cancel: TH.approve.cancelSend,
    done: TH.approve.doneEnroll,
  };
}

function decisionOf(tool: string, input: unknown): Decision | null {
  const value = (input ?? {}) as Record<string, unknown>;
  if (tool === "send_email") return emailDecision(value);
  if (tool === "pin_widget") return pinDecision(value);
  if (tool === "run_job") return jobDecision(value);
  if (tool === "request_leave") return leaveDecision(value);
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

function Approval({ decision, request }: { decision: Decision; request: ApprovalRequest }) {
  if (request.approved !== null) return <Receipt approved={request.approved} decision={decision} />;
  return <DecisionCard decision={decision} request={request} />;
}

function useCourse(courseId: string | undefined): CourseSummary | null {
  const [course, setCourse] = useState<CourseSummary | null>(null);
  useEffect(() => {
    if (!courseId) return;
    const controller = new AbortController();
    fetch(`${COURSES_ENDPOINT}/${encodeURIComponent(courseId)}`, { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<CourseSummary>) : null))
      .then((found) => setCourse(found))
      .catch(() => undefined);
    return () => controller.abort();
  }, [courseId]);
  return course;
}

function usePermissionLabel(kind: string | undefined, key: string | undefined): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!kind || !key || kind === "metric") return;
    const controller = new AbortController();
    const query = new URLSearchParams({ kind, key });
    fetch(`${PERMISSION_LABEL_ENDPOINT}?${query.toString()}`, { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<{ label: string }>) : null))
      .then((found) => setLabel(found?.label ?? null))
      .catch(() => undefined);
    return () => controller.abort();
  }, [kind, key]);
  return label;
}

function useLabels(queries: MetricQuery[]): Labels {
  const [labels, setLabels] = useState<Labels>({});
  const keys = [...new Set(queries.flatMap(labelKeysOf))].sort().join("\n");
  useEffect(() => {
    if (!keys) return;
    const controller = new AbortController();
    const query = new URLSearchParams(keys.split("\n").map((key) => ["v", key]));
    fetch(`${LABELS_ENDPOINT}?${query.toString()}`, { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<{ labels: Labels }>) : null))
      .then((found) => setLabels(found?.labels ?? {}))
      .catch(() => undefined);
    return () => controller.abort();
  }, [keys]);
  return labels;
}

function HandoffApproval({ request }: { request: ApprovalRequest }) {
  const input = (request.input ?? {}) as HandoffInput;
  const labels = useLabels((input.evidence ?? []).slice(0, MAX_EVIDENCE_LABELS));
  return <Approval decision={handoffDecision(input, labels)} request={request} />;
}

function WatchApproval({ request }: { request: ApprovalRequest }) {
  const input = (request.input ?? {}) as WatchInput;
  const labels = useLabels(input.query ? [input.query] : []);
  return <Approval decision={watchDecision(input, labels)} request={request} />;
}

function PermissionApproval({ request }: { request: ApprovalRequest }) {
  const input = (request.input ?? {}) as PermissionInput;
  const label = usePermissionLabel(input.kind, input.key);
  return <Approval decision={permissionDecision(input, label)} request={request} />;
}

function CourseApproval({ request }: { request: ApprovalRequest }) {
  const input = (request.input ?? {}) as EnrollInput;
  const course = useCourse(input.courseId);
  return <Approval decision={enrollDecision(input, course)} request={request} />;
}

/** The one decision the user has to make: who gets the work, what it asks, what approving does. Null for a tool that needs no approval. */
export function renderApproval(request: ApprovalRequest): ReactNode {
  if (request.tool === "enroll_course") return <CourseApproval request={request} />;
  if (request.tool === "set_permission") return <PermissionApproval request={request} />;
  if (request.tool === "create_handoff") return <HandoffApproval request={request} />;
  if (request.tool === "watch_metric") return <WatchApproval request={request} />;
  const decision = decisionOf(request.tool, request.input);
  if (!decision) return null;
  return <Approval decision={decision} request={request} />;
}
