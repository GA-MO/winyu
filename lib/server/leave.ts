import { LEAVE_KINDS, type AccessContext, type Employee, type LeaveKind, type LeavePolicy, type PolicySection, type PolicyTopic } from "@/lib/contracts";
import { TODAY, addDays } from "@/lib/data/dates";
import { signalsOf } from "@/lib/engine/people-signals";
import { formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { ports } from "./ports";
import { calendarOf, type Calendar } from "./ports/calendar";
import { directoryOf } from "./ports/directory";
import { approverOf, requestsOf, submitRequest } from "./staff-requests";

const T = TH.leave;
const DAYS_PER_YEAR = 365;
const LOW_BALANCE_DAYS = 2;
const SATURDAY = 6;
const SUNDAY = 0;
const MAX_LEAVE_SPAN_DAYS = 30;

type Tone = "good" | "bad" | "neutral";
type Balance = { kind: LeaveKind; entitled: number; used: number; pending: number; left: number };

export type LeaveRequestInput = { kind: LeaveKind; from: string; to: string; reason: string };

type LeaveBook = { policy: LeavePolicy; used: Readonly<Record<LeaveKind, number>>; self: Employee | null; calendar: Calendar };

async function leaveBookOf(userId: string): Promise<LeaveBook> {
  const leave = ports().leave;
  const [policy, used, records, calendar] = await Promise.all([leave.policy(), leave.usedThisYear(userId), ports().directory.load(), ports().calendar.load()]);
  return { policy, used, self: directoryOf(records).byId(userId), calendar: calendarOf(calendar) };
}

function isWorkday(iso: string, calendar: Calendar): boolean {
  const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return weekday !== SATURDAY && weekday !== SUNDAY && calendar.holidayOn(iso) === null;
}

/** Working days from `from` to `to` inclusive: Monday to Friday, public holidays left out. */
export function workdaysBetween(from: string, to: string, calendar: Calendar): number {
  let count = 0;
  for (let day = from; day <= to; day = addDays(day, 1)) if (isWorkday(day, calendar)) count += 1;
  return count;
}

function nthWorkdayAfter(from: string, count: number, calendar: Calendar): string {
  let day = from;
  let seen = 0;
  while (seen < count) {
    day = addDays(day, 1);
    if (isWorkday(day, calendar)) seen += 1;
  }
  return day;
}

function annualEntitlement(policy: LeavePolicy, tenureYears: number): number {
  return policy.annualSteps.find((step) => tenureYears >= step.minYears)?.days ?? 0;
}

function entitlementOf(book: LeaveBook, kind: LeaveKind): number {
  if (kind === "sick") return book.policy.sickDays;
  if (kind === "personal") return book.policy.personalDays;
  if (!book.self) return 0;
  const signals = signalsOf(book.self);
  return signals.onProbation ? 0 : annualEntitlement(book.policy, Math.floor(signals.tenureDays / DAYS_PER_YEAR));
}

function balanceOf(userId: string, kind: LeaveKind, book: LeaveBook): Balance {
  const entitled = entitlementOf(book, kind);
  const used = book.used[kind];
  const pending = requestsOf(userId, "leave").filter((request) => request.refId === kind).reduce((sum, request) => sum + request.days, 0);
  return { kind, entitled, used, pending, left: Math.max(entitled - used - pending, 0) };
}

function balanceMetric(balance: Balance) {
  const tone: Tone = balance.left <= LOW_BALANCE_DAYS ? "bad" : "neutral";
  return { label: T.kind[balance.kind], value: T.left(balance.left), detail: T.balanceDetail(balance.entitled, balance.used, balance.pending), tone };
}

function sectionsOf(sections: readonly PolicySection[]) {
  return sections.map((section) => ({ title: section.titleTh, content: section.bodyTh }));
}

async function leavePolicy(access: AccessContext) {
  const book = await leaveBookOf(access.userId);
  const balances = LEAVE_KINDS.map((kind) => balanceOf(access.userId, kind, book));
  const approver = await approverOf(access.userId);
  const annual = balances.find((balance) => balance.kind === "annual");
  const earliest = nthWorkdayAfter(TODAY, book.policy.annualNoticeWorkdays, book.calendar);
  return {
    ok: true as const,
    summary: T.summary(annual?.left ?? 0, approver?.nameTh ?? null),
    data: {
      balances: balances.map(balanceMetric),
      sections: sectionsOf(book.policy.leaveSections),
      form: {
        kinds: balances.map((balance) => ({ value: balance.kind, label: T.kindOption(T.kind[balance.kind], balance.left) })),
        approver: approver?.nameTh ?? null,
        earliest,
        note: T.formNote(formatDateTh(earliest), approver?.nameTh ?? null),
      },
    },
  };
}

/** The policy text for a topic; for leave also the viewer's own balances and the form to file one. */
export async function policyFor(access: AccessContext, topic: PolicyTopic) {
  if (topic === "leave") return leavePolicy(access);
  const benefits = (await ports().leave.policy()).benefitSections;
  return { ok: true as const, summary: T.benefitsSummary(benefits.length), data: { balances: [], sections: sectionsOf(benefits), form: null } };
}

function leaveError(access: AccessContext, input: LeaveRequestInput, days: number, book: LeaveBook): string | null {
  if (input.to < input.from) return T.error.order;
  if (addDays(input.from, MAX_LEAVE_SPAN_DAYS) < input.to) return T.error.tooLong(MAX_LEAVE_SPAN_DAYS);
  if (days === 0) return T.error.noWorkdays;
  if (input.kind !== "sick" && input.from < TODAY) return T.error.past;
  const notice = book.policy.annualNoticeWorkdays;
  if (input.kind === "annual" && input.from < nthWorkdayAfter(TODAY, notice, book.calendar)) return T.error.notice(notice);
  const balance = balanceOf(access.userId, input.kind, book);
  if (balance.entitled === 0) return T.error.probation;
  if (days > balance.left) return T.error.balance(T.kind[input.kind], days, balance.left);
  return null;
}

/** Files a leave request in the viewer's name: working days counted by the server, balance checked, sent to the approver's Inbox. */
export async function requestLeave(access: AccessContext, input: LeaveRequestInput, threadId: string | null) {
  const book = await leaveBookOf(access.userId);
  const days = workdaysBetween(input.from, input.to, book.calendar);
  const error = leaveError(access, input, days, book);
  if (error) return { ok: false as const, error };
  const approver = await approverOf(access.userId);
  if (!approver) return { ok: false as const, error: T.error.noApprover };
  const kindLabel = T.kind[input.kind];
  const range = T.range(formatDateTh(input.from), formatDateTh(input.to));
  await submitRequest(access, approver, {
    kind: "leave",
    refId: input.kind,
    from: input.from,
    to: input.to,
    days,
    reason: input.reason,
    title: T.packetTitle(kindLabel, range),
    ask: T.packetAsk(kindLabel, range, days, input.reason),
    replies: [T.replyApprove, T.replyReschedule],
    threadId,
  });
  const left = balanceOf(access.userId, input.kind, book).left;
  return { ok: true as const, summary: T.sent(kindLabel, days, approver.nameTh), data: { kind: kindLabel, range, days, approver: approver.nameTh, left: T.left(left) } };
}
