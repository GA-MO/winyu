import type { AccessContext } from "@/lib/contracts";
import { holidayOn } from "@/lib/data/entities/calendar";
import { employeeById } from "@/lib/data/entities/people";
import {
  ANNUAL_NOTICE_WORKDAYS,
  BENEFITS_POLICY,
  LEAVE_KINDS,
  LEAVE_POLICY,
  PERSONAL_LEAVE_DAYS,
  SICK_LEAVE_DAYS,
  annualEntitlement,
  leaveUsedThisYear,
  type LeaveKind,
  type PolicySection,
  type PolicyTopic,
} from "@/lib/data/entities/policies";
import { TODAY, addDays } from "@/lib/data/dates";
import { signalsOf } from "@/lib/engine/people-signals";
import { formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
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

function isWorkday(iso: string): boolean {
  const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return weekday !== SATURDAY && weekday !== SUNDAY && holidayOn(iso) === null;
}

/** Working days from `from` to `to` inclusive: Monday to Friday, public holidays left out. */
export function workdaysBetween(from: string, to: string): number {
  let count = 0;
  for (let day = from; day <= to; day = addDays(day, 1)) if (isWorkday(day)) count += 1;
  return count;
}

function nthWorkdayAfter(from: string, count: number): string {
  let day = from;
  let seen = 0;
  while (seen < count) {
    day = addDays(day, 1);
    if (isWorkday(day)) seen += 1;
  }
  return day;
}

function entitlementOf(userId: string, kind: LeaveKind): number {
  if (kind === "sick") return SICK_LEAVE_DAYS;
  if (kind === "personal") return PERSONAL_LEAVE_DAYS;
  const employee = employeeById(userId);
  if (!employee) return 0;
  const signals = signalsOf(employee);
  return signals.onProbation ? 0 : annualEntitlement(Math.floor(signals.tenureDays / DAYS_PER_YEAR));
}

function balanceOf(userId: string, kind: LeaveKind): Balance {
  const entitled = entitlementOf(userId, kind);
  const used = leaveUsedThisYear(userId)[kind];
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

function leavePolicy(access: AccessContext) {
  const balances = LEAVE_KINDS.map((kind) => balanceOf(access.userId, kind));
  const approver = approverOf(access.userId);
  const annual = balances.find((balance) => balance.kind === "annual");
  const earliest = nthWorkdayAfter(TODAY, ANNUAL_NOTICE_WORKDAYS);
  return {
    ok: true as const,
    summary: T.summary(annual?.left ?? 0, approver?.nameTh ?? null),
    data: {
      balances: balances.map(balanceMetric),
      sections: sectionsOf(LEAVE_POLICY),
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
export function policyFor(access: AccessContext, topic: PolicyTopic) {
  if (topic === "leave") return leavePolicy(access);
  return { ok: true as const, summary: T.benefitsSummary(BENEFITS_POLICY.length), data: { balances: [], sections: sectionsOf(BENEFITS_POLICY), form: null } };
}

function leaveError(access: AccessContext, input: LeaveRequestInput, days: number): string | null {
  if (input.to < input.from) return T.error.order;
  if (addDays(input.from, MAX_LEAVE_SPAN_DAYS) < input.to) return T.error.tooLong(MAX_LEAVE_SPAN_DAYS);
  if (days === 0) return T.error.noWorkdays;
  if (input.kind !== "sick" && input.from < TODAY) return T.error.past;
  if (input.kind === "annual" && input.from < nthWorkdayAfter(TODAY, ANNUAL_NOTICE_WORKDAYS)) return T.error.notice(ANNUAL_NOTICE_WORKDAYS);
  const balance = balanceOf(access.userId, input.kind);
  if (balance.entitled === 0) return T.error.probation;
  if (days > balance.left) return T.error.balance(T.kind[input.kind], days, balance.left);
  return null;
}

/** Files a leave request in the viewer's name: working days counted by the server, balance checked, sent to the approver's Inbox. */
export function requestLeave(access: AccessContext, input: LeaveRequestInput, threadId: string | null) {
  const days = workdaysBetween(input.from, input.to);
  const error = leaveError(access, input, days);
  if (error) return { ok: false as const, error };
  const approver = approverOf(access.userId);
  if (!approver) return { ok: false as const, error: T.error.noApprover };
  const kindLabel = T.kind[input.kind];
  const range = T.range(formatDateTh(input.from), formatDateTh(input.to));
  submitRequest(access, approver, {
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
  const left = balanceOf(access.userId, input.kind).left;
  return { ok: true as const, summary: T.sent(kindLabel, days, approver.nameTh), data: { kind: kindLabel, range, days, approver: approver.nameTh, left: T.left(left) } };
}
