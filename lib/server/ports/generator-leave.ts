import { randomUUID } from "node:crypto";
import { LEAVE_KINDS, type LeaveBalance, type LeaveKind, type LeavePolicy, type LeaveRequest, type LeaveSubmission } from "@/lib/contracts";
import { EMPLOYEES } from "@/lib/data/entities/people";
import {
  ANNUAL_LEAVE_STEPS,
  ANNUAL_NOTICE_WORKDAYS,
  BENEFITS_POLICY,
  LEAVE_POLICY,
  PERSONAL_LEAVE_DAYS,
  SICK_LEAVE_DAYS,
  leaveUsedThisYear,
} from "@/lib/data/entities/policies";
import { signalsOf } from "@/lib/engine/people-signals";
import { collection } from "@/lib/server/store/json-store";
import type { LeavePort } from "./leave";

/** Where the demo HRIS keeps its leave requests; Winyu reads and writes them only through the leave port. */
export const DEMO_LEAVE_REQUESTS = "hris-leave-requests";
const DAYS_PER_YEAR = 365;

const POLICY: LeavePolicy = {
  leaveSections: LEAVE_POLICY,
  benefitSections: BENEFITS_POLICY,
  annualSteps: ANNUAL_LEAVE_STEPS,
  sickDays: SICK_LEAVE_DAYS,
  personalDays: PERSONAL_LEAVE_DAYS,
  annualNoticeWorkdays: ANNUAL_NOTICE_WORKDAYS,
};

type StoredRequest = LeaveRequest & { idempotencyKey: string };

function store() {
  return collection<StoredRequest>(DEMO_LEAVE_REQUESTS);
}

function publicOf({ idempotencyKey: _key, ...request }: StoredRequest): LeaveRequest {
  return request;
}

function entitledOf(employeeId: string, kind: LeaveKind): number {
  if (kind === "sick") return SICK_LEAVE_DAYS;
  if (kind === "personal") return PERSONAL_LEAVE_DAYS;
  const employee = EMPLOYEES.find((entry) => entry.id === employeeId);
  if (!employee) return 0;
  const signals = signalsOf(employee);
  if (signals.onProbation) return 0;
  const years = Math.floor(signals.tenureDays / DAYS_PER_YEAR);
  return ANNUAL_LEAVE_STEPS.find((step) => years >= step.minYears)?.days ?? 0;
}

function requestsOf(employeeId: string): StoredRequest[] {
  return store().where((request) => request.employeeId === employeeId);
}

function daysIn(requests: readonly StoredRequest[], kind: LeaveKind, status: LeaveRequest["status"]): number {
  return requests.filter((request) => request.kind === kind && request.status === status).reduce((sum, request) => sum + request.days, 0);
}

function balancesOf(employeeId: string): LeaveBalance[] {
  const taken = leaveUsedThisYear(employeeId);
  const requests = requestsOf(employeeId);
  return LEAVE_KINDS.map((kind) => {
    const entitled = entitledOf(employeeId, kind);
    const used = taken[kind] + daysIn(requests, kind, "approved");
    const pending = daysIn(requests, kind, "pending");
    return { kind, entitled, used, pending, left: Math.max(entitled - used - pending, 0) };
  });
}

class LeaveRefused extends Error {}

function submitted(submission: LeaveSubmission): LeaveRequest {
  const repeated = store().where((request) => request.idempotencyKey === submission.idempotencyKey)[0];
  if (repeated) return publicOf(repeated);
  const balance = balancesOf(submission.employeeId).find((entry) => entry.kind === submission.kind);
  if (!balance || balance.entitled === 0) throw new LeaveRefused(`no ${submission.kind} entitlement for ${submission.employeeId}`);
  if (submission.days > balance.left) throw new LeaveRefused(`${submission.days} days asked, ${balance.left} left`);
  const { idempotencyKey, ...rest } = submission;
  return publicOf(store().put({ ...rest, idempotencyKey, id: `lv_${randomUUID().slice(0, 8)}`, status: "pending", createdAt: new Date().toISOString(), decidedAt: null }));
}

function decided(requestId: string, approverId: string, approved: boolean): LeaveRequest | null {
  const request = store().get(requestId);
  if (!request || request.approverId !== approverId || request.status !== "pending") return request ? publicOf(request) : null;
  return publicOf(store().put({ ...request, status: approved ? "approved" : "returned", decidedAt: new Date().toISOString() }));
}

/** The demo tenant's leave module: the HRIS's own entitlement rules (tenure steps, probation), its record of leave taken, and the requests it holds; a pending request counts against the balance, a returned one does not. */
export const GENERATOR_LEAVE: LeavePort = {
  policy: async () => POLICY,
  balances: async (employeeId) => balancesOf(employeeId),
  requests: async (employeeId) => requestsOf(employeeId).map(publicOf),
  submit: async (submission) => submitted(submission),
  decide: async (requestId, approverId, approved) => decided(requestId, approverId, approved),
};
