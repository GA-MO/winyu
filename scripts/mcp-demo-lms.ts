import type { Employee } from "@/lib/contracts";
import { ports } from "@/lib/server/ports";
import { LMS_DEMO_TOOL, lmsDemoEnv } from "@/lib/server/connectors/lms-demo-config";
import { formatDateTh } from "@/lib/i18n/format";
import { mcpDemoFetch, portOf } from "./mcp-demo-server";

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

async function trainingHistory(args: TrainingArgs, viewerId: string) {
  const { employees } = await ports().directory.load();
  return { items: employees.filter((employee) => matches(employee, args, viewerId)).flatMap(rowsOf) };
}

/** The demo LMS: training history per person, only for callers whose identity Winyu signed. */
export const lmsDemoFetch = mcpDemoFetch({
  info: SERVER_INFO,
  secret: () => lmsDemoEnv().secret,
  tools: [{ ...TOOL, call: (args, identity) => trainingHistory(args as TrainingArgs, identity.userId) }],
});

if (import.meta.main) {
  const server = Bun.serve({ port: portOf(lmsDemoEnv().url), hostname: "127.0.0.1", fetch: lmsDemoFetch });
  console.log(`LMS demo MCP on ${server.url}mcp`);
}
