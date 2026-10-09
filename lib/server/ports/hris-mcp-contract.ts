import { z } from "zod";
import { CANDIDATE_STAGES, LEAVE_KINDS, LEAVE_REQUEST_STATUSES, REGIONS, type Candidate, type Employee, type LeaveBalance, type LeavePolicy, type LeaveRequest, type OpenPosition } from "@/lib/contracts";
import { mcpEndpointFromEnv, type McpEndpoint } from "./mcp-port";

export const HRIS_MCP_PORT = 3293;

const regionSchema = z.enum(REGIONS);
const section = z.object({ titleTh: z.string(), bodyTh: z.string() });

export const employeeSchema = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  nameTh: z.string(),
  gender: z.enum(["female", "male"]),
  birthYear: z.number(),
  title: z.string(),
  departmentId: z.string(),
  region: regionSchema.nullable(),
  provinceId: z.string().nullable(),
  siteId: z.string().nullable(),
  managerId: z.string().nullable(),
  hiredOn: z.string(),
  photo: z.string(),
  salaryThb: z.number(),
  overtimeHours3m: z.number(),
  history: z.array(z.object({ date: z.string(), kind: z.enum(["hired", "promoted", "moved", "trained", "award"]), labelTh: z.string() })),
  certificates: z.array(z.object({ nameTh: z.string(), expires: z.string() })),
}) satisfies z.ZodType<Employee>;

export const openPositionSchema = z.object({
  id: z.string(),
  title: z.string(),
  departmentId: z.string(),
  region: regionSchema.nullable(),
  provinceId: z.string().nullable(),
  managerId: z.string(),
  openedOn: z.string(),
}) satisfies z.ZodType<OpenPosition>;

export const candidateSchema = z.object({
  id: z.string(),
  nameTh: z.string(),
  positionId: z.string(),
  stage: z.enum(CANDIDATE_STAGES),
  score: z.number().nullable(),
  appliedOn: z.string(),
  experienceTh: z.string(),
  strengthTh: z.string(),
  concernTh: z.string().nullable(),
  sourceTh: z.string(),
  expectedSalaryThb: z.number(),
}) satisfies z.ZodType<Candidate>;

export const leavePolicySchema = z.object({
  leaveSections: z.array(section).readonly(),
  benefitSections: z.array(section).readonly(),
  annualSteps: z.array(z.object({ minYears: z.number(), days: z.number() })).readonly(),
  sickDays: z.number(),
  personalDays: z.number(),
  annualNoticeWorkdays: z.number(),
}) satisfies z.ZodType<LeavePolicy>;

const leaveKind = z.enum(LEAVE_KINDS);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const leaveBalanceSchema = z.object({ kind: leaveKind, entitled: z.number(), used: z.number(), pending: z.number(), left: z.number() }) satisfies z.ZodType<LeaveBalance>;

export const leaveRequestSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  kind: leaveKind,
  from: isoDate,
  to: isoDate,
  days: z.number(),
  reason: z.string(),
  approverId: z.string(),
  status: z.enum(LEAVE_REQUEST_STATUSES),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
}) satisfies z.ZodType<LeaveRequest>;

/** The HR system's MCP contract for Winyu's directory, leave and recruiting ports, one tool per port method: plain JSON in, plain JSON out. */
export const HRIS_MCP_TOOLS = {
  load_directory: {
    description: "Everyone employed, with their manager, department, region, site, pay, overtime, career history and certificates, and every position still open. The whole directory in one call; Winyu decides who may see what.",
    input: z.object({}),
    output: z.object({ employees: z.array(employeeSchema), openPositions: z.array(openPositionSchema) }),
  },
  leave_policy: {
    description: "The published leave and benefits rules: what each kind of leave is worth, the annual-leave steps by years of service and how much notice annual leave needs.",
    input: z.object({}),
    output: leavePolicySchema,
  },
  leave_balances: {
    description: "One employee's leave this year per kind, as the HR system counts it: entitled, taken, waiting for a decision, and left.",
    input: z.object({ employeeId: z.string().min(1) }),
    output: z.object({ balances: z.array(leaveBalanceSchema) }),
  },
  list_leave_requests: {
    description: "One employee's leave requests with their status (pending, approved, returned).",
    input: z.object({ employeeId: z.string().min(1) }),
    output: z.object({ requests: z.array(leaveRequestSchema) }),
  },
  submit_leave_request: {
    description: "Files a leave request for an employee with the approver Winyu routes it to. A repeated idempotencyKey returns the first request. Refused when the balance does not cover it.",
    input: z.object({ employeeId: z.string().min(1), kind: leaveKind, from: isoDate, to: isoDate, days: z.number().int().positive(), reason: z.string(), approverId: z.string().min(1), idempotencyKey: z.string().min(1) }),
    output: leaveRequestSchema,
  },
  decide_leave_request: {
    description: "Records the approver's decision on a pending leave request; only the request's approver can decide it.",
    input: z.object({ requestId: z.string().min(1), approverId: z.string().min(1), approved: z.boolean() }),
    output: z.object({ request: leaveRequestSchema.nullable() }),
  },
  list_candidates: {
    description: "Every candidate for every open position, from the recruiting module: stage, score, experience, strengths, concerns, source and expected salary.",
    input: z.object({}),
    output: z.object({ candidates: z.array(candidateSchema) }),
  },
} as const;

/** Where the HRIS MCP listens, the secret Winyu signs identities with, and how long Winyu waits; from env (`WINYU_HRIS_MCP_*`), with local defaults for the demo only. */
export function hrisMcpEnv(): McpEndpoint {
  return mcpEndpointFromEnv("HRIS", HRIS_MCP_PORT);
}
