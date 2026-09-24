import type { AccessContext } from "@/lib/contracts";
import { peopleViewOf } from "@/lib/access/people-scope";
import { COURSES, courseById, type Course } from "@/lib/data/entities/courses";
import { EMPLOYEES, employeeById, type Employee } from "@/lib/data/entities/people";
import { TODAY, addDays } from "@/lib/data/dates";
import { signalsOf } from "@/lib/engine/people-signals";
import { formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import type { PersonBadge } from "./people";
import { approverOf, requestsOf, submitRequest } from "./staff-requests";
import { staffRequests } from "./agent/collections";

const T = TH.courses;
const MAX_COURSE_ROWS = 12;
const MAX_SUGGESTED = 2;
const FEW_SEATS = 3;

type Tone = "good" | "bad" | "neutral";
type Expiring = { employee: Employee; daysLeft: number };

export type CourseQuery = { month: string | null; query: string | null };

function seatsLeft(course: Course): number {
  const requested = staffRequests().all().filter((request) => request.kind === "course" && request.refId === course.id).length;
  return Math.max(course.seats - course.enrolled - requested, 0);
}

function expiringFor(course: Course, employees: Employee[]): Expiring[] {
  if (!course.renewsCertificate) return [];
  return employees.flatMap((employee) => {
    const state = signalsOf(employee).certificates.find((entry) => entry.certificate.nameTh === course.renewsCertificate && entry.status !== "valid");
    return state ? [{ employee, daysLeft: state.daysLeft }] : [];
  }).sort((left, right) => left.daysLeft - right.daysLeft);
}

function teamOf(access: AccessContext): Employee[] {
  return EMPLOYEES.filter((employee) => employee.id !== access.userId && (peopleViewOf(access, employee) ?? "directory") !== "directory");
}

function seatsOf(left: number, course: Course) {
  const tone: Tone = left <= FEW_SEATS ? "bad" : "neutral";
  return { label: left === 0 ? T.full : T.seatsLeft(left, course.seats), tone };
}

function badgesOf(access: AccessContext, course: Course, enrolled: boolean): PersonBadge[] {
  const badges: PersonBadge[] = [];
  if (enrolled) badges.push({ label: T.badge.requested, tone: "success" });
  const self = employeeById(access.userId);
  const mine = self ? expiringFor(course, [self])[0] : undefined;
  if (mine) badges.push({ label: T.badge.yoursExpiring(mine.daysLeft), tone: "danger" });
  return badges;
}

function noteOf(access: AccessContext, course: Course): string | null {
  const team = expiringFor(course, teamOf(access)).slice(0, MAX_SUGGESTED);
  if (team.length === 0) return null;
  return T.suggest(team.map((entry) => T.suggestPerson(entry.employee.nameTh, entry.daysLeft)).join(", "));
}

function rowOf(access: AccessContext, course: Course) {
  const left = seatsLeft(course);
  const enrolled = requestsOf(access.userId, "course").some((request) => request.refId === course.id);
  return {
    id: course.id,
    title: course.titleTh,
    cover: course.cover,
    category: course.categoryTh,
    when: T.when(formatDateTh(course.starts), course.days),
    place: placeOf(course),
    audience: course.audienceTh,
    seats: seatsOf(left, course),
    note: noteOf(access, course),
    badges: badgesOf(access, course, enrolled),
    can_enroll: left > 0 && !enrolled,
  };
}

function placeOf(course: Course): string {
  return course.format === "online" ? T.format.online : `${course.placeTh} · ${T.format[course.format]}`;
}

function matchesQuery(course: Course, query: string): boolean {
  const needle = query.trim();
  return course.titleTh.includes(needle) || course.categoryTh.includes(needle) || course.audienceTh.includes(needle) || (course.renewsCertificate ?? "").includes(needle);
}

function inWindow(course: Course, month: string | null): boolean {
  if (course.starts < TODAY) return false;
  return month ? course.starts.startsWith(month) : true;
}

function relevance(access: AccessContext, course: Course): number {
  const self = employeeById(access.userId);
  if (self && expiringFor(course, [self]).length > 0) return 0;
  if (expiringFor(course, teamOf(access)).length > 0) return 1;
  return 2;
}

/** Upcoming courses (one month, or the next ones): the ones renewing the viewer's or their team's expiring certificate first, then soonest, with seats left and whose certificate each one renews. */
export function listCourses(access: AccessContext, query: CourseQuery) {
  const courses = COURSES.filter((course) => inWindow(course, query.month) && (!query.query || matchesQuery(course, query.query)))
    .sort((left, right) => relevance(access, left) - relevance(access, right) || left.starts.localeCompare(right.starts))
    .slice(0, MAX_COURSE_ROWS);
  if (courses.length === 0) return { ok: true as const, summary: T.none, data: [] };
  const urgent = courses.filter((course) => relevance(access, course) < 2).length;
  return {
    ok: true as const,
    summary: T.summary(courses.length, formatDateTh(courses.reduce((first, course) => (course.starts < first ? course.starts : first), courses[0]?.starts ?? TODAY)), urgent),
    data: courses.map((course) => rowOf(access, course)),
  };
}

/** Asks the viewer's manager to approve a seat on one course; the seat is held once the request is sent. */
export function enrollCourse(access: AccessContext, courseId: string, threadId: string | null) {
  const course = courseById(courseId) ?? COURSES.find((entry) => entry.titleTh.includes(courseId.trim())) ?? null;
  if (!course) return { ok: false as const, error: T.notFound(courseId) };
  if (course.starts < TODAY) return { ok: false as const, error: T.started(course.titleTh) };
  if (requestsOf(access.userId, "course").some((request) => request.refId === course.id)) return { ok: false as const, error: T.already(course.titleTh) };
  if (seatsLeft(course) === 0) return { ok: false as const, error: T.fullError(course.titleTh) };
  const approver = approverOf(access.userId);
  if (!approver) return { ok: false as const, error: T.noApprover };
  const when = T.when(formatDateTh(course.starts), course.days);
  submitRequest(access, approver, {
    kind: "course",
    refId: course.id,
    from: course.starts,
    to: addDays(course.starts, course.days - 1),
    days: course.days,
    reason: course.titleTh,
    title: T.packetTitle(course.titleTh),
    ask: T.packetAsk(course.titleTh, when, placeOf(course)),
    replies: [T.replyApprove, T.replyNext],
    threadId,
  });
  return { ok: true as const, summary: T.sent(course.titleTh, approver.nameTh), data: { courseId: course.id, approver: approver.nameTh, when, seats_left: seatsLeft(course) } };
}
