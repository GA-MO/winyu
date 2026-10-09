import { z } from "zod";
import { ENROLLMENT_STATUSES, type Course, type Enrollment } from "@/lib/contracts";
import { lmsDemoEnv } from "@/lib/server/connectors/lms-demo-config";
import { MCP_DEFAULT_TIMEOUT_MS, type McpEndpoint } from "./mcp-port";

export const courseSchema = z.object({
  id: z.string(),
  titleTh: z.string(),
  categoryTh: z.string(),
  cover: z.string(),
  format: z.enum(["classroom", "online", "field"]),
  placeTh: z.string(),
  starts: z.string(),
  days: z.number(),
  seats: z.number(),
  enrolled: z.number(),
  audienceTh: z.string(),
  renewsCertificate: z.string().nullable(),
  departmentIds: z.array(z.string()).readonly().nullable(),
}) satisfies z.ZodType<Course>;

export const enrollmentSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  courseId: z.string(),
  approverId: z.string(),
  status: z.enum(ENROLLMENT_STATUSES),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
}) satisfies z.ZodType<Enrollment>;

/** The LMS's contract for Winyu's learning port, served beside its training history: the course catalogue with seats and dates, each employee's enrollments, and seat requests. */
export const LEARNING_MCP_TOOLS = {
  list_courses: {
    description: "Every scheduled course in the catalogue with its dates, place, format, seats and how many have enrolled, and the certificate it renews.",
    input: z.object({}),
    output: z.object({ courses: z.array(courseSchema) }),
  },
  list_enrollments: {
    description: "One employee's course enrollments with their status (pending, approved, returned).",
    input: z.object({ employeeId: z.string().min(1) }),
    output: z.object({ enrollments: z.array(enrollmentSchema) }),
  },
  request_seat: {
    description: "Holds a seat on a course for an employee until the approver Winyu routes it to decides. A repeated idempotencyKey returns the first enrollment. Refused when the course is full or has started, or the employee already holds a seat on it.",
    input: z.object({ employeeId: z.string().min(1), courseId: z.string().min(1), approverId: z.string().min(1), idempotencyKey: z.string().min(1) }),
    output: enrollmentSchema,
  },
  decide_enrollment: {
    description: "Records the approver's decision on a pending enrollment; a returned one gives the seat back. Only the enrollment's approver can decide it.",
    input: z.object({ enrollmentId: z.string().min(1), approverId: z.string().min(1), approved: z.boolean() }),
    output: z.object({ enrollment: enrollmentSchema.nullable() }),
  },
} as const;

/** The LMS's endpoint: the same server and secret as its training history connector, and how long Winyu waits for the catalogue. */
export function learningMcpEnv(): McpEndpoint {
  return { ...lmsDemoEnv(), timeoutMs: Number(process.env.WINYU_LMS_MCP_TIMEOUT_MS ?? MCP_DEFAULT_TIMEOUT_MS) };
}
