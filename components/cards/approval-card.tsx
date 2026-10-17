"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowLeftRight, BellRing, Brain, CalendarDays, Check, Eraser, Forward, GraduationCap, LayoutGrid, Mail, PlugZap, RefreshCw, ShieldCheck, Target, X } from "lucide-react";
import { OutboxNote } from "@/components/share/outbox-note";
import { ContradictionNote, RecipientWarnings, useRecipientScopes, useSendPreview, useShareContacts } from "@/components/share/share-sheet";
import { METRIC_IDS, ROLE_IDS, type MetricId, type MetricQuery, type RecipientScope, type RoleId, type WatchCondition } from "@/lib/contracts";
import { conditionLabel } from "@/lib/engine/personal-watches";
import { USERS, findUser } from "@/lib/data/entities/users";
import { sharedWith } from "@/lib/cards/describe-call";
import { formatDateTh } from "@/lib/i18n/format";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";
import { cardNamed } from "@/components/chat/card-to-share";
import { businessToday } from "@/lib/data/dates";
import { shareTitle, type ScreenCards, type SendPreview, type ShareContact, type SharedCard } from "@/lib/share/card";
import { contradictionOf } from "@/lib/share/figures";
import { askAboutOf, askNaming, deadlineWords, followsEarlier, matterAsk, matterDeadline, MATTER_INTENTS, MATTER_URGENCIES, sendIntent, type MatterIntent, type MatterUrgency } from "@/lib/share/matter";
import { pinQuestion } from "@/lib/share/pin";
import { matchRecipients } from "@/lib/share/recipients";

const COURSES_ENDPOINT = "/api/courses";
const PERMISSION_LABEL_ENDPOINT = "/api/permissions/label";
const LABELS_ENDPOINT = "/api/labels";
const PIN_PREVIEW_ENDPOINT = "/api/pins/preview";
const NO_PIN_PREVIEW: PinPreviewInfo = { hero: null, replaces: [] };

type PinPreviewInfo = { hero: string | null; replaces: string[] };
const MAX_SCOPE_LABELS = 2;
const CONNECTOR_TOOL = /^[a-z][a-z0-9_]*__/;
const MAX_ARG_CHIPS = 4;
const WORDS_SENT = 4;
const URGENCY_BADGE: Record<MatterUrgency, string> = {
  now: "bg-danger/10 text-danger",
  today: "bg-warning/12 text-warning",
  this_week: "bg-muted text-muted-foreground",
};
const CONFIRM =
  "inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-ink-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CANCEL =
  "inline-flex items-center rounded-full border border-border bg-card px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:border-foreground/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** A write tool call waiting for the user: `approved` is null until they decide; `onScreen` holds the cards on screen when it was asked, the ones a send_card call names (null when the conversation has none yet, absent where nobody knows). */
export type ApprovalRequest = {
  tool: string;
  input: unknown;
  approved: boolean | null;
  approve: () => void;
  reject: () => void;
  onScreen?: ScreenCards | null;
  question?: string | null;
  labelTh?: string;
};

type Decision = {
  icon: LucideIcon;
  title: string;
  person: string | null;
  subjectLabel: string;
  subject: string | null;
  body: { label: string; text: string } | null;
  chips: string[];
  chipsLabel?: string;
  urgency: MatterUrgency | null;
  due?: string | null;
  effect: string;
  confirm: string;
  cancel: string;
  done: string;
  extra?: ReactNode;
  blocked?: string;
  mailed?: boolean;
};

type EmailInput = { toUserId?: string; subject?: string; body?: string };
type PinInput = { title?: string; kind?: string; query?: MetricQuery };
type JobInput = { job?: string };
type WatchInput = { title?: string; query?: MetricQuery; condition?: WatchCondition };
type PermissionInput = { role?: string; kind?: string; key?: string; value?: string };
type LeaveInput = { kind?: string; from?: string; to?: string; reason?: string };
type EnrollInput = { courseId?: string };
type RememberInput = { type?: string; value?: string; until?: string | null };
type ForgetInput = { about?: string };
type SendInput = { cardRef?: unknown; to?: unknown; ask?: unknown; intent?: unknown; urgency?: unknown; card?: { reads?: unknown; alertIds?: unknown } };
/** The card a send would carry as the sheet shows it (its title and headline figure), or why there is none to show: no card on screen, or several and the call named none. */
type CardToSend = { card: SharedCard; title: string; hero: string | null } | { card: null; problem: "none" | "unclear" };
/** The send sheet as the approval shows it: the card, who gets it (and whether that is the card's owner), what it asks, how soon and by when, and what the server found. */
type SendPlan = { sending: CardToSend; recipients: ShareContact[]; owner: boolean; ask: string; intent: MatterIntent; urgency: MatterUrgency; due: string | null; preview: SendPreview };
type CourseSummary = { id: string; title: string; starts: string; days: number };

const PERMISSION_VALUE_LABEL: Record<string, string> = {
  full: TH.adminAudit.visibility.full,
  masked: TH.adminAudit.visibility.masked,
  none: TH.adminAudit.visibility.none,
  allow: TH.admin.permission.allow,
  deny: TH.admin.permission.deny,
};

function personLine(userId: string | undefined): { name: string; line: string | null } {
  const user = userId ? findUser(userId) : null;
  if (!user) return { name: userId ?? "", line: null };
  return { name: user.nameTh, line: `${user.title} · ${user.department}` };
}

type Labels = Record<string, string>;

function labelKeysOf(query: MetricQuery): string[] {
  return Object.entries(query.filters ?? {}).flatMap(([dim, values]) => [values ?? []].flat().map((value) => `${dim}:${value}`));
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
    mailed: true,
  };
}

function PinPreview({ title, preview }: { title: string | null; preview: PinPreviewInfo }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {preview.hero && title ? (
        <div className="min-w-0 rounded-xl border border-border px-3.5 py-3" data-pin-card>
          <p className="text-[11px] text-muted-foreground">{TH.approve.card}</p>
          <p className="mt-0.5 text-sm font-medium wrap-anywhere">{title}</p>
          <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums" data-pin-hero>
            {preview.hero}
          </p>
        </div>
      ) : null}
      {preview.replaces.length > 0 ? (
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-foreground" data-pin-replaces>
          <ArrowLeftRight className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
          {TH.approve.pinReplaces(preview.replaces)}
        </p>
      ) : null}
    </div>
  );
}

function pinDecision(input: PinInput, preview: PinPreviewInfo = NO_PIN_PREVIEW): Decision {
  const title = input.title ?? null;
  const hero = preview.hero;
  return {
    icon: LayoutGrid,
    title: TH.approve.pinDone,
    person: null,
    subjectLabel: TH.approve.card,
    subject: hero ? null : title,
    body: null,
    chips: [],
    urgency: null,
    effect: TH.approve.effectPin,
    confirm: TH.approve.confirmPin,
    cancel: TH.approve.cancelDo,
    done: preview.replaces.length > 0 ? TH.approve.donePinInstead(preview.replaces) : TH.approve.donePin,
    extra: (hero && title) || preview.replaces.length > 0 ? <PinPreview title={title} preview={preview} /> : undefined,
  };
}

/** What pinning shows for the signed-in person, asked of the server with the question that drew the card it pins: the figure the widget will lead with (null until it answers or when it cannot) and the pinned cards it replaces; kept once the person has answered, so the receipt still names them. */
function usePinPreview(input: PinInput, question: string | null): PinPreviewInfo {
  const [preview, setPreview] = useState<PinPreviewInfo>(NO_PIN_PREVIEW);
  const body = input.title && input.query ? JSON.stringify({ title: input.title, kind: input.kind ?? "metric", query: input.query, question }) : null;
  useEffect(() => {
    if (!body) return;
    const controller = new AbortController();
    fetch(PIN_PREVIEW_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body, signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<Partial<PinPreviewInfo>>) : null))
      .then((payload) => setPreview({ hero: payload?.hero ?? null, replaces: Array.isArray(payload?.replaces) ? payload.replaces : [] }))
      .catch(() => undefined);
    return () => controller.abort();
  }, [body]);
  return preview;
}

function scopeOf(query: MetricQuery, labels: Labels): string {
  const dims = Object.entries(query.filters ?? {})
    .flatMap(([dim, values]) => [values ?? []].flat().map((value) => labels[`${dim}:${value}`] ?? value))
    .slice(0, MAX_SCOPE_LABELS);
  return [metricLabel(query.metric), ...dims].join(" · ");
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

function rememberDecision(input: RememberInput): Decision {
  const type = TH.account.memoryType[input.type as keyof typeof TH.account.memoryType] ?? null;
  return {
    icon: Brain,
    title: TH.approve.rememberDone,
    person: null,
    subjectLabel: TH.approve.rememberLabel,
    subject: input.value ?? null,
    body: null,
    chips: [type, input.until ? TH.approve.rememberUntil(formatDateTh(input.until)) : null].filter((chip): chip is string => chip !== null),
    urgency: null,
    effect: TH.approve.effectRemember,
    confirm: TH.approve.confirmRemember,
    cancel: TH.approve.cancelDo,
    done: TH.approve.doneRemember,
  };
}

function forgetDecision(input: ForgetInput): Decision {
  return {
    icon: Eraser,
    title: TH.approve.forgetDone,
    person: null,
    subjectLabel: TH.approve.forgetLabel,
    subject: input.about ?? null,
    body: null,
    chips: [],
    urgency: null,
    effect: TH.approve.effectForget,
    confirm: TH.approve.confirmForget,
    cancel: TH.approve.cancelDo,
    done: TH.approve.doneForget,
  };
}

function roleOf(value: string | undefined): RoleId | null {
  return ROLE_IDS.includes(value as RoleId) ? (value as RoleId) : null;
}

const NATIVE_TOOL_LABELS: Readonly<Record<string, { label: string } | undefined>> = TH.admin.tools;

function permissionSubject(input: PermissionInput, label: string | null): string {
  const key = input.key ?? "";
  if (label) return label;
  if (input.kind === "metric" && METRIC_IDS.includes(key as MetricId)) return metricLabel(key as MetricId);
  if (input.kind === "tool" && NATIVE_TOOL_LABELS[key]) return NATIVE_TOOL_LABELS[key].label;
  return TH.approve.permissionKind[input.kind ?? ""] ?? TH.approve.permissionChange;
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

function typedNames(input: SendInput): string[] {
  return Array.isArray(input.to) ? input.to.filter((name): name is string => typeof name === "string") : [];
}

/** The card this send_card call carries, by the same rule the server applies: a pressed button's card, else the card on screen its `cardRef` names, else the one card there is. */
function cardToSend(input: SendInput, onScreen: ScreenCards | null | undefined): CardToSend {
  const pressed = readsOf(input);
  if (pressed) return { card: pressed, title: shareTitle(pressed), hero: null };
  if (!onScreen) return { card: null, problem: "none" };
  const choice = cardNamed(onScreen, typeof input.cardRef === "string" ? input.cardRef : undefined);
  if (choice.kind === "card") return { card: choice.card.target.card, title: choice.card.title, hero: choice.card.hero };
  return { card: null, problem: choice.kind === "none" ? "none" : "unclear" };
}

function readsOf(input: SendInput): SharedCard | null {
  const reads = input.card?.reads;
  if (!Array.isArray(reads) || reads.length === 0) return null;
  return { kind: "tool", reads: reads.filter((read): read is SharedCard["reads"][number] => typeof read === "object" && read !== null && typeof (read as { tool?: unknown }).tool === "string") };
}

/** The person's own words a send is about, for the preview to find the rows they single out: the ask, the question, and what they typed before it. */
function wordsOf(input: SendInput, request: ApprovalRequest): string[] {
  const words = [typeof input.ask === "string" ? input.ask : null, request.question ?? null, ...(request.onScreen?.said ?? [])];
  return [...new Set(words.filter((word): word is string => Boolean(word?.trim())))].slice(0, WORDS_SENT);
}

function alertIdsOf(input: SendInput): string[] {
  const ids = input.card?.alertIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

function oneOf<T extends string>(options: readonly T[], value: unknown): T | undefined {
  return options.find((option) => option === value);
}

function recipientsOf(input: SendInput, contacts: ShareContact[] | null, preview: SendPreview): { people: ShareContact[]; owner: boolean } {
  if (!contacts) return { people: [], owner: false };
  const names = typedNames(input);
  if (names.length > 0) return { people: matchRecipients(names, contacts).flatMap((match) => (match.kind === "found" ? [match.person] : [])), owner: false };
  const owner = contacts.find((contact) => contact.id === preview.ownerId);
  return owner ? { people: [owner], owner: true } : { people: [], owner: false };
}

/** The send sheet filled in the way send_card will send it: the same card, intent, urgency, deadline, draft ask and recipient rules the server applies. */
function sendPlan(input: SendInput, sending: CardToSend, contacts: ShareContact[] | null, preview: SendPreview, question: string | null): SendPlan {
  const { people, owner } = recipientsOf(input, contacts, preview);
  const intent = sendIntent(oneOf(MATTER_INTENTS, input.intent), Math.max(people.length, 1));
  const typed = typeof input.ask === "string" ? input.ask.trim() : "";
  const titled = sending.card ? { ...sending, title: preview.title ?? sending.title, hero: preview.focus?.hero ?? sending.hero } : sending;
  const ask = titled.card ? askNaming(matterAsk(typed, intent, titled.title), askAboutOf(preview.focus, preview.subject ?? null)) : typed;
  const { urgency, due } = matterDeadline(oneOf(MATTER_URGENCIES, input.urgency), question, intent, businessToday());
  return { sending: titled, recipients: people, owner, ask, intent, urgency, due, preview };
}

function CardPreview({ sending }: { sending: CardToSend }) {
  if (!sending.card) return null;
  return (
    <div className="min-w-0 rounded-xl border border-border px-3.5 py-3" data-send-card>
      <p className="text-[11px] text-muted-foreground">{TH.approve.card}</p>
      <p className="mt-0.5 text-sm font-medium wrap-anywhere" data-send-card-title>
        {sending.title}
      </p>
      {sending.hero ? (
        <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums" data-send-card-hero>
          {sending.hero}
        </p>
      ) : null}
    </div>
  );
}

function SendSheet({ plan, scopes }: { plan: SendPlan; scopes: readonly RecipientScope[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-3" data-send-sheet>
      <CardPreview sending={plan.sending} />
      {plan.recipients.length > 0 ? (
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground">{plan.owner ? TH.share.suggested : TH.approve.sendRecipients}</p>
          <ul className="mt-1.5 flex flex-col gap-2">
            {plan.recipients.map((contact) => (
              <li key={contact.id} className="min-w-0" data-send-recipient={contact.id}>
                <p className="truncate text-sm font-medium">{contact.nameTh}</p>
                <p className="truncate text-xs text-muted-foreground">{contact.title}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground" data-send-intent={plan.intent}>
        {TH.share.intent[plan.intent]} · {TH.share.intentHint[plan.intent]}
      </p>
      <ContradictionNote text={contradictionOf(plan.ask, plan.preview.figures) ?? plan.preview.focus?.claim ?? null} />
      <RecipientWarnings scopes={scopes} granting={false} grant={null} />
      {plan.intent === "act" && plan.preview.goal ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground" data-send-goal>
          <Target className="size-3.5 text-primary" aria-hidden />
          {plan.preview.goal}
        </p>
      ) : null}
    </div>
  );
}

function blockedOf(plan: SendPlan, contactsLoaded: boolean): string | undefined {
  if (!plan.sending.card) return plan.sending.problem === "unclear" ? TH.approve.sendUnclearCard : TH.approve.sendNoCard;
  if (contactsLoaded && plan.recipients.length === 0) return TH.approve.sendNoRecipient;
  return undefined;
}

function sendDecision(plan: SendPlan, scopes: readonly RecipientScope[], contactsLoaded: boolean, input: SendInput): Decision {
  const names = plan.recipients.length > 0 ? plan.recipients.map((contact) => contact.nameTh).join(", ") : sharedWith(input.to) || TH.approve.cardOwner;
  return {
    icon: Forward,
    title: TH.approve.sendDone(names),
    person: plan.recipients.length === 1 ? `${plan.recipients[0].title}` : null,
    subjectLabel: TH.approve.card,
    subject: null,
    body: plan.ask ? { label: TH.approve.askLabel, text: plan.ask } : null,
    chips: [],
    urgency: plan.intent === "act" ? plan.urgency : null,
    due: plan.intent === "act" ? plan.due : null,
    effect: TH.approve.effectSend(names, plan.intent),
    confirm: TH.approve.confirmSend,
    cancel: TH.approve.cancelSend,
    done: TH.approve.doneSend(names),
    extra: <SendSheet plan={plan} scopes={scopes} />,
    blocked: blockedOf(plan, contactsLoaded),
  };
}

function argText(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function connectorDecision(input: Record<string, unknown>, label: string): Decision {
  const args = Object.entries(input).flatMap(([key, value]) => {
    const text = argText(value);
    return text ? [{ key, text }] : [];
  });
  const longest = [...args].sort((left, right) => right.text.length - left.text.length)[0];
  const body = longest && longest.text.length > 24 ? longest : null;
  return {
    icon: PlugZap,
    title: label,
    person: null,
    subjectLabel: TH.approve.connectorSubject,
    subject: null,
    body: body ? { label: body.key, text: body.text } : null,
    chips: args.filter((arg) => arg !== body).slice(0, MAX_ARG_CHIPS).map((arg) => `${arg.key}: ${arg.text}`),
    chipsLabel: TH.approve.connectorSubject,
    urgency: null,
    effect: TH.approve.effectConnector,
    confirm: TH.approve.confirmConnector,
    cancel: TH.approve.cancelDo,
    done: TH.approve.doneConnector(label),
  };
}

function decisionOf(tool: string, input: unknown, labelTh?: string): Decision | null {
  const value = (input ?? {}) as Record<string, unknown>;
  if (CONNECTOR_TOOL.test(tool)) return connectorDecision(value, labelTh ?? tool);
  if (tool === "send_email") return emailDecision(value);
  if (tool === "run_job") return jobDecision(value);
  if (tool === "request_leave") return leaveDecision(value);
  if (tool === "remember") return rememberDecision(value);
  if (tool === "forget") return forgetDecision(value);
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
        {approved && decision.mailed ? <OutboxNote className="mt-1" /> : null}
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
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${URGENCY_BADGE[decision.urgency]}`} data-send-urgency={decision.urgency}>
            {decision.due ? TH.share.dueBy(formatDateTh(decision.due)) : TH.share.urgency[decision.urgency]}
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
            <p className="text-[11px] text-muted-foreground">{decision.chipsLabel ?? TH.approve.attached}</p>
            <div className="flex flex-wrap gap-1.5">
              {decision.chips.map((chip) => (
                <span key={chip} className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
                  {chip}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {decision.extra}

        {decision.blocked ? <p className="text-xs leading-relaxed text-warning">{decision.blocked}</p> : <p className="text-xs leading-relaxed text-muted-foreground">{decision.effect}</p>}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
        <p className="text-[11px] text-muted-foreground">{TH.approve.guard}</p>
        <div className="flex gap-2">
          <button type="button" className={CANCEL} onClick={request.reject}>
            {decision.cancel}
          </button>
          {decision.blocked ? null : (
            <button type="button" className={CONFIRM} onClick={request.approve}>
              <Check className="size-4" aria-hidden />
              {decision.confirm}
            </button>
          )}
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

function PinApproval({ request }: { request: ApprovalRequest }) {
  const input = (request.input ?? {}) as PinInput;
  const question = pinQuestion(request.onScreen?.cards ?? [], input.query, request.question ?? null);
  const preview = usePinPreview(request.approved === null ? input : {}, question);
  return <Approval decision={pinDecision(input, preview)} request={request} />;
}

function SendApproval({ request }: { request: ApprovalRequest }) {
  const contacts = useShareContacts();
  const input = (request.input ?? {}) as SendInput;
  const sending = cardToSend(input, request.onScreen);
  const card = sending.card;
  const asking = request.approved === null;
  const preview = useSendPreview(asking ? card : null, alertIdsOf(input), wordsOf(input, request));
  const asked = request.question ?? null;
  const earlier = request.onScreen?.said.find((text) => text !== asked) ?? null;
  const plan = sendPlan(input, sending, contacts, preview, deadlineWords(asked, earlier, followsEarlier(asked, request.onScreen?.warned ?? false, preview.focus), businessToday()));
  const scopes = useRecipientScopes(asking ? card : null, plan.recipients.map((contact) => contact.id));
  return <Approval decision={sendDecision(plan, scopes, contacts !== null, input)} request={request} />;
}

/** The one decision the user has to make: who gets the work, what it asks, what approving does. Null for a tool that needs no approval. */
export function renderApproval(request: ApprovalRequest): ReactNode {
  if (request.tool === "send_card") return <SendApproval request={request} />;
  if (request.tool === "pin_widget") return <PinApproval request={request} />;
  if (request.tool === "enroll_course") return <CourseApproval request={request} />;
  if (request.tool === "set_permission") return <PermissionApproval request={request} />;
  if (request.tool === "watch_metric") return <WatchApproval request={request} />;
  const decision = decisionOf(request.tool, request.input, request.labelTh);
  if (!decision) return null;
  return <Approval decision={decision} request={request} />;
}
