import type { AccessContext, LeaveBalance, LeaveKind, LeavePolicy, PolicySection, PolicyTopic } from "@/lib/contracts";
import { TODAY, addDays } from "@/lib/data/dates";
import { formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { ports } from "./ports";
import { calendarOf, type Calendar } from "./ports/calendar";
import { approverOf, deliverRequest } from "./staff-requests";

const T = TH.leave;
const LOW_BALANCE_DAYS = 2;
const SATURDAY = 6;
const SUNDAY = 0;
const MAX_LEAVE_SPAN_DAYS = 30;

type Tone = "good" | "bad" | "neutral";

export type LeaveRequestInput = { kind: LeaveKind; from: string; to: string; reason: string };

type LeaveBook = { policy: LeavePolicy; balances: readonly LeaveBalance[]; calendar: Calendar };

async function leaveBookOf(userId: string): Promise<LeaveBook> {
  const leave = ports().leave;
  const [policy, balances, calendar] = await Promise.all([leave.policy(), leave.balances(userId), ports().calendar.load()]);
  return { policy, balances, calendar: calendarOf(calendar) };
}

function balanceOf(kind: LeaveKind, book: LeaveBook): LeaveBalance {
  return book.balances.find((balance) => balance.kind === kind) ?? { kind, entitled: 0, used: 0, pending: 0, left: 0 };
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

function balanceMetric(balance: LeaveBalance) {
  const tone: Tone = balance.left <= LOW_BALANCE_DAYS ? "bad" : "neutral";
  return { label: T.kind[balance.kind], value: T.left(balance.left), detail: T.balanceDetail(balance.entitled, balance.used, balance.pending), tone };
}

function sectionsOf(sections: readonly PolicySection[]) {
  return sections.map((section) => ({ title: section.titleTh, content: section.bodyTh }));
}

async function leavePolicy(access: AccessContext) {
  const book = await leaveBookOf(access.userId);
  const balances = book.balances;
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

function leaveError(input: LeaveRequestInput, days: number, book: LeaveBook): string | null {
  if (input.to < input.from) return T.error.order;
  if (addDays(input.from, MAX_LEAVE_SPAN_DAYS) < input.to) return T.error.tooLong(MAX_LEAVE_SPAN_DAYS);
  if (days === 0) return T.error.noWorkdays;
  if (input.kind !== "sick" && input.from < TODAY) return T.error.past;
  const notice = book.policy.annualNoticeWorkdays;
  if (input.kind === "annual" && input.from < nthWorkdayAfter(TODAY, notice, book.calendar)) return T.error.notice(notice);
  const balance = balanceOf(input.kind, book);
  if (balance.entitled === 0) return T.error.probation;
  if (days > balance.left) return T.error.balance(T.kind[input.kind], days, balance.left);
  return null;
}

/** Files a leave request in the viewer's name with the leave system: working days counted from the company calendar, the balance the leave system keeps checked first, the request filed once per call, and the approver told in their Inbox. */
export async function requestLeave(access: AccessContext, input: LeaveRequestInput, threadId: string | null, callId: string) {
  const book = await leaveBookOf(access.userId);
  const days = workdaysBetween(input.from, input.to, book.calendar);
  const error = leaveError(input, days, book);
  if (error) return { ok: false as const, error };
  const approver = await approverOf(access.userId);
  if (!approver) return { ok: false as const, error: T.error.noApprover };
  const kindLabel = T.kind[input.kind];
  const range = T.range(formatDateTh(input.from), formatDateTh(input.to));
  const request = await ports().leave.submit({ employeeId: access.userId, kind: input.kind, from: input.from, to: input.to, days, reason: input.reason, approverId: approver.id, idempotencyKey: callId });
  await deliverRequest(access, approver, { system: "leave", requestId: request.id, employeeId: access.userId }, {
    title: T.packetTitle(kindLabel, range),
    ask: T.packetAsk(kindLabel, range, days, input.reason),
    replies: [T.replyApprove, T.replyReschedule],
    threadId,
  });
  const left = balanceOf(input.kind, { ...book, balances: await ports().leave.balances(access.userId) }).left;
  return { ok: true as const, summary: T.sent(kindLabel, days, approver.nameTh), data: { kind: kindLabel, range, days, approver: approver.nameTh, left: T.left(left) } };
}
