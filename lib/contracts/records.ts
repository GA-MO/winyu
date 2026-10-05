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

/** One mail as Winyu hands it to the mail system; the system gives it an id and a time. */
export type MailMessage = Omit<OutboxEntry, "id" | "at">;
