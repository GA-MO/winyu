import type { Employee } from "@/lib/contracts";
import { ports } from "@/lib/server/ports";
import { LMS_DEMO_PORT, LMS_DEMO_TOOL, lmsDemoEnv } from "@/lib/server/connectors/lms-demo-config";
import { verifiedIdentity } from "@/lib/server/connectors/signed-identity";
import { formatDateTh } from "@/lib/i18n/format";

const MCP_PATH = "/mcp";
const SERVER_INFO = { name: "cop-lms-demo", version: "0.1.0" };
const MIN_SCORE = 60;
const SCORE_SPREAD = 40;
const ALL = "all";

type JsonRpcRequest = { jsonrpc: "2.0"; id?: string | number; method: string; params?: Record<string, unknown> };
type TrainingArgs = { employeeId?: string | null; name?: string | null; regions?: string | null };

const TOOLS = [
  {
    name: LMS_DEMO_TOOL,
    description: "Courses and certificates per employee from the LMS.",
    inputSchema: {
      type: "object",
      properties: { employeeId: { type: ["string", "null"] }, name: { type: ["string", "null"] }, regions: { type: ["string", "null"] } },
    },
  },
];

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
  const items = employees.filter((employee) => matches(employee, args, viewerId)).flatMap(rowsOf);
  return { content: [{ type: "text", text: JSON.stringify({ items }) }], structuredContent: { items } };
}

function reply(id: JsonRpcRequest["id"], result: unknown): Response {
  return Response.json({ jsonrpc: "2.0", id, result });
}

function failure(id: JsonRpcRequest["id"], code: number, message: string, status = 200): Response {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status });
}

async function answer(request: JsonRpcRequest, viewerId: string): Promise<Response> {
  if (request.id === undefined) return new Response(null, { status: 202 });
  if (request.method === "initialize") {
    return reply(request.id, { protocolVersion: request.params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: SERVER_INFO });
  }
  if (request.method === "tools/list") return reply(request.id, { tools: TOOLS });
  if (request.method === "tools/call" && request.params?.name === LMS_DEMO_TOOL) {
    return reply(request.id, await trainingHistory((request.params.arguments ?? {}) as TrainingArgs, viewerId));
  }
  if (request.method === "tools/call") return reply(request.id, { isError: true, content: [{ type: "text", text: `unknown tool ${String(request.params?.name)}` }] });
  return failure(request.id, -32601, `method ${request.method} not found`);
}

/** One HTTP request to the demo LMS: JSON-RPC over POST, only for callers whose identity Cop signed. */
export async function lmsDemoFetch(request: Request): Promise<Response> {
  if (new URL(request.url).pathname !== MCP_PATH) return new Response("not found", { status: 404 });
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const identity = verifiedIdentity(request.headers, lmsDemoEnv().secret);
  if (!identity) return failure(undefined, -32001, "identity signature missing or wrong", 401);
  return answer((await request.json()) as JsonRpcRequest, identity.userId);
}

if (import.meta.main) {
  const server = Bun.serve({ port: LMS_DEMO_PORT, hostname: "127.0.0.1", fetch: lmsDemoFetch });
  console.log(`LMS demo MCP on ${server.url}mcp`);
}
