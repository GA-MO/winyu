import type { Region } from "./identity";
import type { OutboxEntry } from "./handoff";

export type Gender = "female" | "male";
export type CareerEventKind = "hired" | "promoted" | "moved" | "trained" | "award";
export type CareerEvent = { date: string; kind: CareerEventKind; labelTh: string };
export type Certificate = { nameTh: string; expires: string };

export type Employee = {
  id: string;
  userId: string | null;
  nameTh: string;
  gender: Gender;
  birthYear: number;
  title: string;
  departmentId: string;
  region: Region | null;
  provinceId: string | null;
  siteId: string | null;
  managerId: string | null;
  hiredOn: string;
  photo: string;
  salaryThb: number;
  overtimeHours3m: number;
  history: CareerEvent[];
  certificates: Certificate[];
};

export type OpenPosition = { id: string; title: string; departmentId: string; region: Region | null; provinceId: string | null; managerId: string; openedOn: string };

export const CANDIDATE_STAGES = ["applied", "screening", "interview", "final", "offer"] as const;
export type CandidateStage = (typeof CANDIDATE_STAGES)[number];

export type Candidate = {
  id: string;
  nameTh: string;
  positionId: string;
  stage: CandidateStage;
  score: number | null;
  appliedOn: string;
  experienceTh: string;
  strengthTh: string;
  concernTh: string | null;
  sourceTh: string;
  expectedSalaryThb: number;
};

export type CourseFormat = "classroom" | "online" | "field";

export type Course = {
  id: string;
  titleTh: string;
  categoryTh: string;
  cover: string;
  format: CourseFormat;
  placeTh: string;
  starts: string;
  days: number;
  seats: number;
  enrolled: number;
  audienceTh: string;
  renewsCertificate: string | null;
  departmentIds: readonly string[] | null;
};

export type SiteKind = "plant" | "dc" | "office";
export type IncidentKind = "lti" | "first_aid" | "near_miss" | "property";

export type Site = {
  id: string;
  nameTh: string;
  kind: SiteKind;
  provinceId: string;
  placeTh: string;
  region: Region;
  photo: string;
  headcount: number;
  overtimeHoursPerHead3m: number;
  safetyLeadId: string | null;
  lastLtiBeforeLog: string | null;
};

export type Incident = {
  id: string;
  siteId: string;
  date: string;
  kind: IncidentKind;
  titleTh: string;
  detailTh: string;
  actionTh: string;
  closed: boolean;
};

export type Holiday = { date: string; nameTh: string; label: string };
export type DateWindow = { from: string; to: string; nameTh: string };
export type CalendarEventKind = "alcohol_ban" | "holiday" | "festival";
export type CalendarEvent = { from: string; to: string; nameTh: string; kind: CalendarEventKind };

export const LEAVE_KINDS = ["annual", "sick", "personal"] as const;
export type LeaveKind = (typeof LEAVE_KINDS)[number];
export type PolicySection = { titleTh: string; bodyTh: string };
export type PolicyTopic = "leave" | "benefits";

/** The leave rules the HR system publishes: what each kind is worth and how much notice annual leave needs. */
export type LeavePolicy = {
  leaveSections: readonly PolicySection[];
  benefitSections: readonly PolicySection[];
  annualSteps: readonly { minYears: number; days: number }[];
  sickDays: number;
  personalDays: number;
  annualNoticeWorkdays: number;
};

/** What one employee has of one kind of leave, as the leave system counts it: entitled this year, taken, waiting for a decision, and left. */
export type LeaveBalance = { kind: LeaveKind; entitled: number; used: number; pending: number; left: number };

export const LEAVE_REQUEST_STATUSES = ["pending", "approved", "returned"] as const;
export type LeaveRequestStatus = (typeof LEAVE_REQUEST_STATUSES)[number];

/** A leave request as the leave system keeps it. */
export type LeaveRequest = { id: string; employeeId: string; kind: LeaveKind; from: string; to: string; days: number; reason: string; approverId: string; status: LeaveRequestStatus; createdAt: string; decidedAt: string | null };

/** What Winyu files with the leave system; a repeated `idempotencyKey` returns the first request. */
export type LeaveSubmission = { employeeId: string; kind: LeaveKind; from: string; to: string; days: number; reason: string; approverId: string; idempotencyKey: string };

/** One row of a person's training as the LMS records it: a course they finished (with its score) or a certificate they hold (with its expiry). */
export type TrainingRecord = { employeeId: string; kind: "course" | "certificate"; title: string; date: string | null; expires: string | null; score: number | null };

/** One store visit as the CRM records it: which agent, when, by whom, what came of it, and the order taken. */
export type StoreVisit = { agentId: string; region: Region; visitedOn: string; repName: string; outcome: string; note: string | null; orderValueThb: number };

export const ENROLLMENT_STATUSES = ["pending", "approved", "returned"] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

/** A seat on a course as the LMS keeps it: pending and approved ones are counted in the course's `enrolled`, a returned one gives the seat back. */
export type Enrollment = { id: string; employeeId: string; courseId: string; approverId: string; status: EnrollmentStatus; createdAt: string; decidedAt: string | null };

/** What Winyu asks the LMS for; a repeated `idempotencyKey` returns the first enrollment. */
export type SeatRequest = { employeeId: string; courseId: string; approverId: string; idempotencyKey: string };

/** One mail as Winyu hands it to the mail system; the system gives it an id and a time. */
export type MailMessage = Omit<OutboxEntry, "id" | "at">;
