import { TODAY, toDayIndex } from "@/lib/data/dates";
import type { Certificate, Employee } from "@/lib/contracts";

export const PROBATION_DAYS = 119;
export const NEW_HIRE_DAYS = 180;
export const HIGH_OVERTIME_HOURS = 90;
export const NEW_HIRE_OVERTIME_HOURS = 40;
export const STALLED_YEARS = 7;
export const STALLED_MAX_AGE = 50;
export const CERT_WARNING_DAYS = 45;
export const RETIREMENT_AGE = 60;
export const RETIREMENT_HORIZON_YEARS = 3;

const DAYS_PER_YEAR = 365.25;

export type CertificateState = { certificate: Certificate; daysLeft: number; status: "expired" | "expiring" | "valid" };
export type RiskLevel = "high" | "watch";
export type PeopleSignals = {
  tenureDays: number;
  age: number;
  onProbation: boolean;
  newHire: boolean;
  highOvertime: boolean;
  certificates: CertificateState[];
  yearsToRetirement: number | null;
  riskReasons: string[];
  risk: RiskLevel | null;
};

function daysBetween(from: string, to: string): number {
  return toDayIndex(to) - toDayIndex(from);
}

function certificateState(certificate: Certificate, today: string): CertificateState {
  const daysLeft = daysBetween(today, certificate.expires);
  const status = daysLeft < 0 ? "expired" : daysLeft <= CERT_WARNING_DAYS ? "expiring" : "valid";
  return { certificate, daysLeft, status };
}

function lastStepDate(employee: Employee): string {
  const steps = employee.history.filter((event) => event.kind === "hired" || event.kind === "promoted" || event.kind === "moved");
  return steps.reduce((latest, event) => (event.date > latest ? event.date : latest), employee.hiredOn);
}

function riskReasonsOf(employee: Employee, tenureDays: number, age: number, today: string): string[] {
  const reasons: string[] = [];
  if (employee.overtimeHours3m >= HIGH_OVERTIME_HOURS) reasons.push(`โอที 3 เดือน ${employee.overtimeHours3m} ชม.`);
  if (tenureDays < NEW_HIRE_DAYS && employee.overtimeHours3m >= NEW_HIRE_OVERTIME_HOURS) reasons.push("คนใหม่แต่ทำโอทีหนัก");
  const stalledYears = Math.floor(daysBetween(lastStepDate(employee), today) / DAYS_PER_YEAR);
  if (stalledYears >= STALLED_YEARS && age < STALLED_MAX_AGE) reasons.push(`ไม่ได้เลื่อนตำแหน่ง ${stalledYears} ปี`);
  return reasons;
}

/** The facts and the attrition judgement Winyu derives for one employee on a given day. */
export function signalsOf(employee: Employee, today: string = TODAY): PeopleSignals {
  const tenureDays = daysBetween(employee.hiredOn, today);
  const age = Number(today.slice(0, 4)) - employee.birthYear;
  const yearsLeft = RETIREMENT_AGE - age;
  const riskReasons = riskReasonsOf(employee, tenureDays, age, today);
  return {
    tenureDays,
    age,
    onProbation: tenureDays < PROBATION_DAYS,
    newHire: tenureDays < NEW_HIRE_DAYS,
    highOvertime: employee.overtimeHours3m >= HIGH_OVERTIME_HOURS,
    certificates: employee.certificates.map((certificate) => certificateState(certificate, today)),
    yearsToRetirement: yearsLeft <= RETIREMENT_HORIZON_YEARS ? Math.max(yearsLeft, 0) : null,
    riskReasons,
    risk: riskReasons.length >= 2 ? "high" : riskReasons.length === 1 ? "watch" : null,
  };
}

/** Tenure in Thai: "3 ปี 2 เดือน", "2 เดือน", "12 วัน". */
export function tenureLabel(days: number): string {
  if (days < 31) return `${Math.max(days, 0)} วัน`;
  const months = Math.floor(days / (DAYS_PER_YEAR / 12));
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${rest} เดือน`;
  return rest === 0 ? `${years} ปี` : `${years} ปี ${rest} เดือน`;
}
