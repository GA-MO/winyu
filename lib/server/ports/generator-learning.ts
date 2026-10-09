import { randomUUID } from "node:crypto";
import type { Course, Employee, Enrollment, SeatRequest, TrainingRecord } from "@/lib/contracts";
import { TODAY } from "@/lib/data/dates";
import { COURSES } from "@/lib/data/entities/courses";
import { EMPLOYEES } from "@/lib/data/entities/people";
import { collection } from "@/lib/server/store/json-store";
import type { LearningPort } from "./learning";

/** Where the demo LMS keeps its enrollments; Winyu reads and writes them only through the learning port. */
export const DEMO_ENROLLMENTS = "lms-enrollments";

type StoredEnrollment = Enrollment & { idempotencyKey: string };

const MIN_SCORE = 60;
const SCORE_SPREAD = 40;

function scoreOf(seed: string): number {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return MIN_SCORE + (hash % SCORE_SPREAD);
}

function trainingOf(employee: Employee): TrainingRecord[] {
  const courses = employee.history
    .filter((event) => event.kind === "trained")
    .map((event): TrainingRecord => ({ employeeId: employee.id, kind: "course", title: event.labelTh, date: event.date, expires: null, score: scoreOf(`${employee.id}:${event.labelTh}`) }));
  const certificates = employee.certificates.map((certificate): TrainingRecord => ({ employeeId: employee.id, kind: "certificate", title: certificate.nameTh, date: null, expires: certificate.expires, score: null }));
  return [...courses, ...certificates];
}

class SeatRefused extends Error {}

function store() {
  return collection<StoredEnrollment>(DEMO_ENROLLMENTS);
}

function publicOf({ idempotencyKey: _key, ...enrollment }: StoredEnrollment): Enrollment {
  return enrollment;
}

function held(enrollment: Enrollment): boolean {
  return enrollment.status !== "returned";
}

function catalogue(): Course[] {
  const enrollments = store().all().filter(held);
  return COURSES.map((course) => ({ ...course, enrolled: course.enrolled + enrollments.filter((enrollment) => enrollment.courseId === course.id).length }));
}

function requested(request: SeatRequest): Enrollment {
  const repeated = store().where((entry) => entry.idempotencyKey === request.idempotencyKey)[0];
  if (repeated) return publicOf(repeated);
  const course = catalogue().find((entry) => entry.id === request.courseId);
  if (!course) throw new SeatRefused(`no course ${request.courseId}`);
  if (course.starts < TODAY) throw new SeatRefused(`${course.id} has started`);
  if (course.enrolled >= course.seats) throw new SeatRefused(`${course.id} is full`);
  if (store().where((entry) => entry.employeeId === request.employeeId && entry.courseId === request.courseId).some(held)) throw new SeatRefused(`${request.employeeId} already holds a seat on ${course.id}`);
  const { idempotencyKey, ...rest } = request;
  return publicOf(store().put({ ...rest, idempotencyKey, id: `en_${randomUUID().slice(0, 8)}`, status: "pending", createdAt: new Date().toISOString(), decidedAt: null }));
}

function decided(enrollmentId: string, approverId: string, approved: boolean): Enrollment | null {
  const enrollment = store().get(enrollmentId);
  if (!enrollment || enrollment.approverId !== approverId || enrollment.status !== "pending") return enrollment ? publicOf(enrollment) : null;
  return publicOf(store().put({ ...enrollment, status: approved ? "approved" : "returned", decidedAt: new Date().toISOString() }));
}

/** The demo tenant's LMS: the catalogue with every held seat counted, the seat requests it holds (refusing a full or started course and a second seat for the same person), and each person's finished courses with scores and certificates. */
export const GENERATOR_LEARNING: LearningPort = {
  courses: async () => catalogue(),
  enrollments: async (employeeId) => store().where((entry) => entry.employeeId === employeeId).map(publicOf),
  requestSeat: async (request) => requested(request),
  decide: async (enrollmentId, approverId, approved) => decided(enrollmentId, approverId, approved),
  trainingHistory: async (employeeIds) => EMPLOYEES.filter((employee) => employeeIds.includes(employee.id)).flatMap(trainingOf),
};
