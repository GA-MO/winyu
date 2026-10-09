import type { AccessContext, Course, Employee } from "@/lib/contracts";
import { peopleViewOf } from "@/lib/access/people-scope";
import { TODAY } from "@/lib/data/dates";
import { departmentById } from "@/lib/data/entities/hr";
import { signalsOf } from "@/lib/engine/people-signals";
import { formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import type { PersonBadge } from "./people";
import { approverOf, deliverRequest } from "./staff-requests";
import { ports } from "./ports";
import { directoryOf, type Directory } from "./ports/directory";

const T = TH.courses;
const MAX_COURSE_ROWS = 12;
const MAX_SUGGESTED = 2;
const FEW_SEATS = 3;
const ROLE_SEPARATOR = " ";
const GROUP_WORDS = /^(ทีม|ฝ่าย|แผนก)/;

type Tone = "good" | "bad" | "neutral";
type Expiring = { employee: Employee; daysLeft: number };

/** Who a course is for, in the words a search may use: its own text, and the groups it serves (its departments, and the roles and departments of the people holding the certificate it renews). */
type CoursePurpose = { texts: string[]; groups: string[] };

export type CourseQuery = { month: string | null; query: string | null };

function seatsLeft(course: Course): number {
  return Math.max(course.seats - course.enrolled, 0);
}

/** The courses this employee holds a seat on, pending or approved, as the LMS records them. */
async function heldCourses(employeeId: string): Promise<ReadonlySet<string>> {
  const enrollments = await ports().learning.enrollments(employeeId);
  return new Set(enrollments.filter((enrollment) => enrollment.status !== "returned").map((enrollment) => enrollment.courseId));
}

function expiringFor(course: Course, employees: Employee[]): Expiring[] {
  if (!course.renewsCertificate) return [];
  return employees.flatMap((employee) => {
    const state = signalsOf(employee).certificates.find((entry) => entry.certificate.nameTh === course.renewsCertificate && entry.status !== "valid");
    return state ? [{ employee, daysLeft: state.daysLeft }] : [];
  }).sort((left, right) => left.daysLeft - right.daysLeft);
}

function teamOf(access: AccessContext, directory: Directory): Employee[] {
  return directory.employees.filter((employee) => employee.id !== access.userId && (peopleViewOf(access, employee, directory) ?? "directory") !== "directory");
}

function seatsOf(left: number, course: Course) {
  const tone: Tone = left <= FEW_SEATS ? "bad" : "neutral";
  return { label: left === 0 ? T.full : T.seatsLeft(left, course.seats), tone };
}

function badgesOf(access: AccessContext, course: Course, enrolled: boolean, directory: Directory): PersonBadge[] {
  const badges: PersonBadge[] = [];
  if (enrolled) badges.push({ label: T.badge.requested, tone: "success" });
  const self = directory.byId(access.userId);
  const mine = self ? expiringFor(course, [self])[0] : undefined;
  if (mine) badges.push({ label: T.badge.yoursExpiring(mine.daysLeft), tone: "danger" });
  return badges;
}

function noteOf(access: AccessContext, course: Course, directory: Directory): string | null {
  const team = expiringFor(course, teamOf(access, directory)).slice(0, MAX_SUGGESTED);
  if (team.length === 0) return null;
  return T.suggest(team.map((entry) => T.suggestPerson(entry.employee.nameTh, entry.daysLeft)).join(", "));
}

function rowOf(access: AccessContext, course: Course, directory: Directory, held: ReadonlySet<string>) {
  const left = seatsLeft(course);
  const enrolled = held.has(course.id);
  return {
    id: course.id,
    title: course.titleTh,
    cover: course.cover,
    category: course.categoryTh,
    when: T.when(formatDateTh(course.starts), course.days),
    place: placeOf(course),
    audience: course.audienceTh,
    seats: seatsOf(left, course),
    note: noteOf(access, course, directory),
    badges: badgesOf(access, course, enrolled, directory),
    can_enroll: left > 0 && !enrolled,
  };
}

function placeOf(course: Course): string {
  return course.format === "online" ? T.format.online : `${course.placeTh} · ${T.format[course.format]}`;
}

function roleOf(title: string): string {
  return title.split(ROLE_SEPARATOR)[0] ?? title;
}

function purposeOf(course: Course, employees: readonly Employee[]): CoursePurpose {
  const holders = course.renewsCertificate ? employees.filter((employee) => employee.certificates.some((certificate) => certificate.nameTh === course.renewsCertificate)) : [];
  const departmentIds = new Set([...(course.departmentIds ?? []), ...holders.map((holder) => holder.departmentId)]);
  const departments = [...departmentIds].flatMap((id) => {
    const department = departmentById(id);
    return department ? [department.nameTh, department.label] : [];
  });
  const texts = [course.titleTh, course.categoryTh, course.audienceTh, course.renewsCertificate ?? ""];
  return { texts, groups: [...departments, ...holders.map((holder) => roleOf(holder.title))].map((group) => group.toLowerCase()) };
}

function matchesQuery(purpose: CoursePurpose, query: string): boolean {
  const words = query.trim().toLowerCase();
  const needle = words.replace(GROUP_WORDS, "") || words;
  return [...purpose.texts.map((text) => text.toLowerCase()), ...purpose.groups].some((term) => term.includes(needle)) || purpose.groups.some((group) => needle.includes(group));
}

function inWindow(course: Course, month: string | null): boolean {
  if (course.starts < TODAY) return false;
  return month ? course.starts.startsWith(month) : true;
}

function relevance(access: AccessContext, course: Course, directory: Directory): number {
  const self = directory.byId(access.userId);
  if (self && expiringFor(course, [self]).length > 0) return 0;
  if (expiringFor(course, teamOf(access, directory)).length > 0) return 1;
  return 2;
}

/** Upcoming courses (one month, or the next ones), searched by what each course is for: the ones renewing the viewer's or their team's expiring certificate first, then soonest, with seats left and whose certificate each one renews. */
export async function listCourses(access: AccessContext, query: CourseQuery) {
  const [catalogue, records, held] = await Promise.all([ports().learning.courses(), ports().directory.load(), heldCourses(access.userId)]);
  const directory = directoryOf(records);
  const courses = catalogue.filter((course) => inWindow(course, query.month) && (!query.query || matchesQuery(purposeOf(course, directory.employees), query.query)))
    .sort((left, right) => relevance(access, left, directory) - relevance(access, right, directory) || left.starts.localeCompare(right.starts))
    .slice(0, MAX_COURSE_ROWS);
  if (courses.length === 0) return { ok: true as const, summary: T.none, data: [] };
  const urgent = courses.filter((course) => relevance(access, course, directory) < 2).length;
  return {
    ok: true as const,
    summary: T.summary(courses.length, formatDateTh(courses.reduce((first, course) => (course.starts < first ? course.starts : first), courses[0]?.starts ?? TODAY)), urgent),
    data: courses.map((course) => rowOf(access, course, directory, held)),
  };
}

/** One course by id or by words from its title, for the tool and the approval card. */
export type RenewalRound = { course: Course; enrolled: boolean; seatsLeft: number };

/** The next round that renews a certificate, and whether this user already asked for a seat in any round that renews it; null when none is scheduled. */
export async function renewalRoundFor(certificateNameTh: string, userId: string): Promise<RenewalRound | null> {
  const rounds = (await ports().learning.courses())
    .filter((course) => course.renewsCertificate === certificateNameTh && course.starts >= TODAY)
    .sort((left, right) => left.starts.localeCompare(right.starts));
  const requested = await heldCourses(userId);
  const next = rounds.find((course) => seatsLeft(course) > 0) ?? rounds[0];
  if (!next) return null;
  return { course: next, enrolled: rounds.some((course) => requested.has(course.id)), seatsLeft: seatsLeft(next) };
}

export async function findCourse(courseId: string): Promise<Course | null> {
  const catalogue = await ports().learning.courses();
  return catalogue.find((entry) => entry.id === courseId) ?? catalogue.find((entry) => entry.titleTh.includes(courseId.trim())) ?? null;
}

/** Asks the LMS to hold a seat on one course in the viewer's name, once per call, and tells the viewer's manager in their Inbox; the LMS keeps the seat until the manager decides. */
export async function enrollCourse(access: AccessContext, courseId: string, threadId: string | null, callId: string) {
  const course = await findCourse(courseId);
  if (!course) return { ok: false as const, error: T.notFound(courseId) };
  if (course.starts < TODAY) return { ok: false as const, error: T.started(course.titleTh) };
  if ((await heldCourses(access.userId)).has(course.id)) return { ok: false as const, error: T.already(course.titleTh) };
  if (seatsLeft(course) === 0) return { ok: false as const, error: T.fullError(course.titleTh) };
  const approver = await approverOf(access.userId);
  if (!approver) return { ok: false as const, error: T.noApprover };
  const when = T.when(formatDateTh(course.starts), course.days);
  const enrollment = await ports().learning.requestSeat({ employeeId: access.userId, courseId: course.id, approverId: approver.id, idempotencyKey: callId });
  await deliverRequest(access, approver, { system: "course", requestId: enrollment.id, employeeId: access.userId }, {
    title: T.packetTitle(course.titleTh),
    ask: T.packetAsk(course.titleTh, when, placeOf(course)),
    replies: [T.replyApprove, T.replyNext],
    threadId,
  });
  const now = (await findCourse(course.id)) ?? course;
  return { ok: true as const, summary: T.sent(course.titleTh, approver.nameTh), data: { courseId: course.id, approver: approver.nameTh, when, seats_left: seatsLeft(now) } };
}
