import type { Employee } from "@/lib/contracts";
import { LMS_DEMO_TOOL, lmsDemoEnv } from "@/lib/server/connectors/lms-demo-config";
import { formatDateTh } from "@/lib/i18n/format";
import { GENERATOR_PORTS } from "@/lib/server/ports/generator";
import type { DirectoryPort } from "@/lib/server/ports/directory";
import type { LearningPort } from "@/lib/server/ports/learning";
import { LEARNING_MCP_TOOLS } from "@/lib/server/ports/learning-mcp-contract";
import { contractTools, mcpDemoFetch, portOf } from "./mcp-demo-server";

const SERVER_INFO = { name: "winyu-lms-demo", version: "0.1.0" };
const MIN_SCORE = 60;
const SCORE_SPREAD = 40;
const ALL = "all";

type TrainingArgs = { employeeId?: string | null; name?: string | null; regions?: string | null };

const TOOL = {
  name: LMS_DEMO_TOOL,
  description: "Courses and certificates per employee from the LMS.",
  inputSchema: {
    type: "object",
    properties: { employeeId: { type: ["string", "null"] }, name: { type: ["string", "null"] }, regions: { type: ["string", "null"] } },
  },
};

function scoreOf(seed: string): number {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return MIN_SCORE + (hash % SCORE_SPREAD);
}

function rowsOf(employee: Employee) {
  const person = { employee_id: employee.id, employee_name: employee.nameTh, region: employee.region };
  const courses = employee.history
    .filter((event) => event.kind === "trained")
    .map((event) => {
      const score = scoreOf(`${employee.id}:${event.labelTh}`);
      return { ...person, kind_label: "อบรม", course: event.labelTh, date: event.date, date_label: formatDateTh(event.date), expires_label: null, score, score_label: `${score} คะแนน` };
    });
  const certificates = employee.certificates.map((certificate) => ({
    ...person,
    kind_label: "ใบรับรอง",
    course: certificate.nameTh,
    date: null,
    date_label: null,
    expires_label: `หมดอายุ ${formatDateTh(certificate.expires)}`,
    score: null,
    score_label: null,
  }));
  return [...courses, ...certificates];
}

function matches(employee: Employee, args: TrainingArgs, viewerId: string): boolean {
  if (args.regions && args.regions !== ALL && (!employee.region || !args.regions.split(",").includes(employee.region))) return false;
  if (args.employeeId) return employee.id === args.employeeId;
  if (args.name) return employee.nameTh.includes(args.name);
  return employee.id === viewerId || employee.managerId === viewerId;
}

async function trainingHistory(directory: DirectoryPort, args: TrainingArgs, viewerId: string) {
  const { employees } = await directory.load();
  return { items: employees.filter((employee) => matches(employee, args, viewerId)).flatMap(rowsOf) };
}

/** What the demo LMS reads: its course catalogue, the people whose training it records, and the secret it checks Winyu's signature with. */
export type LmsDemoSystems = { learning: LearningPort; directory: DirectoryPort; secret: () => string };

/** The demo LMS: training history per person and the course catalogue Winyu's learning port reads, only for callers whose identity Winyu signed. */
export function lmsDemoFetchFor(systems: LmsDemoSystems) {
  return mcpDemoFetch({
    info: SERVER_INFO,
    secret: systems.secret,
    tools: [
      { ...TOOL, call: (args, identity) => trainingHistory(systems.directory, args as TrainingArgs, identity.userId) },
      ...contractTools(LEARNING_MCP_TOOLS, {
        list_courses: async () => ({ courses: [...(await systems.learning.courses())] }),
        list_enrollments: async ({ employeeId }) => ({ enrollments: [...(await systems.learning.enrollments(employeeId))] }),
        request_seat: (request) => systems.learning.requestSeat(request),
        decide_enrollment: async ({ enrollmentId, approverId, approved }) => ({ enrollment: await systems.learning.decide(enrollmentId, approverId, approved) }),
      }),
    ],
  });
}

export const lmsDemoFetch = lmsDemoFetchFor({ ...GENERATOR_PORTS, secret: () => lmsDemoEnv().secret });

if (import.meta.main) {
  const server = Bun.serve({ port: portOf(lmsDemoEnv().url), hostname: "127.0.0.1", fetch: lmsDemoFetch });
  console.log(`LMS demo MCP on ${server.url}mcp`);
}
