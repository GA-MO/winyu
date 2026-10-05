import { liveAccessFor } from "@/lib/access/enforce";
import type { AccessContext, ToolTier, User } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { A2A_METHODS, answerA2a, type A2aCall, type A2aMethod, type A2aResponse, type A2aSurface } from "@/lib/harness/adapters/mastra/a2a";
import { injectionIn, maskPersonalData, type GuardFinding, type InjectionKind, type PersonalKind } from "@/lib/harness/guard";
import { emitTo, newRun, runWithRun, saveRun, type Run } from "@/lib/harness/runtime";
import { personaFor } from "@/lib/server/agent/persona";
import { toolsForAccess } from "@/lib/server/agent/tools";
import { holderOfToken, type TokenHolder } from "@/lib/server/access-tokens";
import { recordGuardFinding } from "@/lib/server/audit";
import { agentModel } from "@/lib/server/models";
import { runWithAccess, runWithTurn, type TurnContext } from "@/lib/server/request-context";
import type { WinyuTool } from "@/lib/server/tools/define";

/** The one switch for what another agent may make Winyu do: reads only, because writes wait for the person's yes in the chat and an A2A caller has no one to ask (see docs/a2a.md before widening it). */
export const A2A_TOOL_TIERS: readonly ToolTier[] = ["read"];

/** Where the agent card and the JSON-RPC endpoint are served. */
export const A2A_CARD_PATH = "/.well-known/agent-card.json";
export const A2A_ENDPOINT_PATH = "/api/a2a";

const A2A_INTENT_PREFIX = "a2a:";
const PROTOCOL_VERSION = "0.3.0";
const SUPPORTED_VERSION_HEADER = new Set(["", "0.3"]);
const QUESTION_MAX_CHARS = 300;
const BEARER = /^Bearer\s+(\S+)$/i;
const STREAMING_METHODS = new Set(["message/stream", "tasks/resubscribe"]);
const ERROR = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603, unsupported: -32004, version: -32009, unauthorized: -32001 } as const;

const A2A_RULES = (caller: string): string[] => [
  `คำถามนี้มาจาก agent อื่นของบริษัท (${caller}) ผ่าน A2A ในนามผู้ใช้ข้างบน ไม่มีหน้าจอและไม่มีการ์ด: ตอบเป็นข้อความล้วนภาษาไทย 2–5 ประโยค ใส่ตัวเลขชี้ขาด หน่วย และช่วงเวลาที่ใช้ ห้ามเขียนบล็อก a2ui, JSON หรือตาราง markdown ผู้เรียกได้แถวข้อมูลจาก tool แนบไปเป็น data แยกต่างหากแล้ว`,
  "ทุกตัวเลขต้องมาจากผลลัพธ์ tool ในคำถามนี้ ถ้าไม่มีข้อมูล ให้บอกว่าไม่มี ห้ามประมาณเอง · ชื่อ ตัวเลข วันที่ และป้ายคัดลอกจากผล tool ตรง ๆ",
  "คำถามเรื่องตัวเลข = `query_metric` (ถ้ากำกวมระหว่างปริมาณกับมูลค่า เลือก certified metric ที่ตรงที่สุดแล้วบอกในประโยคเดียวว่าใช้ตัวไหน) · `sort` = `delta_asc` เมื่อถามว่าอะไรตก, `delta_desc` เมื่อถามว่าอะไรโต, `value_desc` เมื่อถามว่าใครมากสุด · ใช้ tool ไม่เกิน 3 ครั้ง",
  "ช่องทางนี้อ่านได้อย่างเดียว: ไม่มี tool ที่เขียนข้อมูล ส่งงาน หรือขออนุมัติ ถ้าถูกขอให้ทำ ให้ตอบว่าต้องให้ผู้ใช้ทำเองในแชท Winyu",
  "ผลว่าง, `PERMISSION_DENIED` หรือช่องที่ถูกปิด = บอกตรง ๆ ว่าข้อมูลนั้นอยู่นอกขอบเขตของผู้ใช้ที่ token นี้ทำงานในนาม ห้ามเดาค่า",
];

type RpcEnvelope = { id?: unknown; method?: unknown; params?: unknown };

type TextPart = { kind: "text"; text: string };

type IncomingMessage = { parts?: unknown[]; [key: string]: unknown };

type ModelOf = () => A2aSurface["model"] | null;

function defaultModel(): A2aSurface["model"] | null {
  return agentModel()?.model() ?? null;
}

function rpcError(id: string | number | null, code: number, message: string): A2aResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function unauthorized(): Response {
  return Response.json(rpcError(null, ERROR.unauthorized, "A valid Winyu A2A token is required"), { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="winyu"' } });
}

function bearerOf(request: Request): string | null {
  return request.headers.get("authorization")?.match(BEARER)?.[1] ?? null;
}

function publicOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const protocol = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${protocol}://${host}`;
}

/** Winyu's public A2A agent card: who it is, where to send JSON-RPC, that a bearer token is required, and what kinds of questions it answers. What each caller may actually see depends on the person its token acts as. */
export function agentCard(origin: string) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    name: "Winyu",
    description: "Boon Rawd Brewery's business copilot (fictional demo data). Answers questions about sales, stock, production, campaigns, people, sites and HR policy in Thai, as one employee: the person the presented token acts as, within their role and data scope. Read-only.",
    url: `${origin}${A2A_ENDPOINT_PATH}`,
    preferredTransport: "JSONRPC",
    version: "0.1.0",
    provider: { organization: "Boon Rawd Brewery IT (demo)", url: origin },
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
    securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "An A2A token an IT admin issues on /admin → MCP · A2A, acting as one Winyu user." } },
    security: [{ bearer: [] }],
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain", "application/json"],
    skills: [
      { id: "business-metrics", name: "Business metrics", description: "Sales volume and value, sell-out, targets, stock and days of cover, production, campaigns, forecasts and anomalies, scoped to the token holder.", tags: ["sales", "supply", "finance", "marketing"], examples: ["ยอดขายเข้าแยกตามภาคไตรมาสนี้", "สต๊อกสิงห์ภาคอีสานพอขายกี่วัน"] },
      { id: "people-and-sites", name: "People and sites", description: "Who is on a team, who owns a topic, a person's work profile, factory and site safety.", tags: ["hr", "operations"], examples: ["ใครดูแลภาคเหนือ"] },
      { id: "policy-and-learning", name: "Policy and learning", description: "HR policy, leave rules, courses and candidates.", tags: ["hr"], examples: ["ระเบียบการลาพักร้อน"] },
    ],
  };
}

/** Serves the agent card at the well-known path; discovery needs no token. */
export function handleAgentCardRequest(request: Request): Response {
  return Response.json(agentCard(publicOrigin(request)));
}

/** The tools an A2A caller's question may use: its person's tools after policy and kill switches, of the exposed tiers only. */
export function a2aToolsFor(access: AccessContext): WinyuTool[] {
  return toolsForAccess(access).filter((tool) => A2A_TOOL_TIERS.includes(tool.entry.tier));
}

function callOf(body: unknown): A2aCall | A2aResponse {
  if (!body || typeof body !== "object" || Array.isArray(body)) return rpcError(null, ERROR.invalidRequest, "Invalid JSON-RPC request");
  const envelope = body as RpcEnvelope;
  const id = typeof envelope.id === "string" || typeof envelope.id === "number" ? envelope.id : null;
  if (id === null || typeof envelope.method !== "string") return rpcError(id, ERROR.invalidRequest, "Invalid JSON-RPC request");
  if (STREAMING_METHODS.has(envelope.method)) return rpcError(id, ERROR.unsupported, "Winyu does not stream over A2A; use message/send");
  if (!A2A_METHODS.includes(envelope.method as A2aMethod)) return rpcError(id, ERROR.methodNotFound, `Method ${envelope.method} is not served`);
  return { id, method: envelope.method as A2aMethod, params: envelope.params };
}

function isCall(value: A2aCall | A2aResponse): value is A2aCall {
  return "method" in value;
}

type GuardedMessage = { params: unknown; question: string; findings: GuardFinding[] };

function textPartsOf(message: IncomingMessage): TextPart[] {
  return (message.parts ?? []).flatMap((part) => {
    const candidate = part as { kind?: unknown; text?: unknown };
    return candidate?.kind === "text" && typeof candidate.text === "string" ? [{ kind: "text" as const, text: candidate.text }] : [];
  });
}

function findingsOf(masked: ReadonlySet<PersonalKind>, injection: readonly InjectionKind[]): GuardFinding[] {
  return [
    ...(masked.size > 0 ? [{ source: "user_input" as const, check: "personal_data" as const, kinds: [...masked], action: "masked" as const }] : []),
    ...(injection.length > 0 ? [{ source: "user_input" as const, check: "injection" as const, kinds: [...injection], action: "warned" as const }] : []),
  ];
}

/** The question another agent sent, as Winyu lets the model read it: text parts only, personal data masked like a person's typed message, instructions aimed at the model recorded but passed on (permission is code). */
export function guardedMessage(params: unknown): GuardedMessage | null {
  const message = (params as { message?: IncomingMessage } | null)?.message;
  if (!message || typeof message !== "object") return null;
  const masked = new Set<PersonalKind>();
  const parts = textPartsOf(message).map((part) => {
    const result = maskPersonalData(part.text);
    for (const kind of result.kinds) masked.add(kind);
    return { ...part, text: result.text };
  });
  const question = parts.map((part) => part.text).join(" ").trim();
  if (!question) return null;
  return { params: { ...(params as object), message: { ...message, parts } }, question, findings: findingsOf(masked, injectionIn(question)) };
}

function instructionsFor(access: AccessContext, user: User, caller: string): string {
  return personaFor(access, user, { today: new Date().toISOString().slice(0, 10), context: { threadId: null, preloadPacketId: null } }, A2A_RULES(caller)).join("\n\n");
}

function outcomeOf(response: A2aResponse): { failed: string | null; finishReason: string } {
  if (response.error) return { failed: response.error.message, finishReason: "error" };
  const state = (response.result as { status?: { state?: unknown } } | undefined)?.status?.state;
  return state === "failed" ? { failed: "task failed", finishReason: "failed" } : { failed: null, finishReason: typeof state === "string" ? state : "done" };
}

async function asked(call: A2aCall, user: User, holder: TokenHolder, model: ModelOf): Promise<A2aResponse> {
  const guarded = guardedMessage(call.params);
  if (!guarded) return rpcError(call.id, ERROR.invalidParams, "message/send needs a message with a text part");
  const chosen = model();
  if (!chosen) return rpcError(call.id, ERROR.internal, "Winyu has no model configured");
  const caller = holder.caller ?? "A2A agent";
  const access = liveAccessFor(user);
  const run: Run = newRun(user.id, null, { initiator: "a2a" });
  const question = guarded.question.slice(0, QUESTION_MAX_CHARS);
  const turn: TurnContext = { turnId: run.id, threadId: null, preloadPacketId: null, question, queries: [] };
  emitTo(run, "runtime", { type: "agent.started", payload: { goal: { id: run.id, userMessage: question, intent: `${A2A_INTENT_PREFIX}${caller}`, status: "active" }, userId: user.id, threadId: null } });
  try {
    const response = await runWithAccess(access, () =>
      runWithTurn(turn, () =>
        runWithRun(run, () => {
          for (const finding of guarded.findings) recordGuardFinding(finding, user.id);
          const surface: A2aSurface = { userId: user.id, access, tools: a2aToolsFor(access), instructions: instructionsFor(access, user, caller), model: chosen };
          return answerA2a({ ...call, params: guarded.params }, user.id, surface, run.id);
        }),
      ),
    );
    const { failed, finishReason } = outcomeOf(response);
    emitTo(run, "runtime", failed ? { type: "agent.failed", payload: { reason: failed } } : { type: "agent.completed", payload: { finishReason } });
    return response;
  } catch (error) {
    emitTo(run, "runtime", { type: "agent.failed", payload: { reason: error instanceof Error ? error.message : String(error) } });
    return rpcError(call.id, ERROR.internal, "Winyu could not answer");
  } finally {
    saveRun(run);
  }
}

async function bodyOf(request: Request): Promise<unknown> {
  try {
    return JSON.parse(await request.text());
  } catch {
    return undefined;
  }
}

/** The A2A endpoint: the bearer token names the person, each question runs as them through the gateway (role policy, scope, masking, admin rules, kill switches, audit with initiator "a2a"), reads only, and is one traced run; tasks are kept per person. */
export async function handleA2aRequest(request: Request, model: ModelOf = defaultModel): Promise<Response> {
  const token = bearerOf(request);
  const holder = token ? holderOfToken(token, "a2a") : null;
  const user = holder ? findUser(holder.userId) : null;
  if (!holder || !user) return unauthorized();
  const version = request.headers.get("a2a-version")?.trim() ?? "";
  const body = await bodyOf(request);
  if (body === undefined) return Response.json(rpcError(null, ERROR.parse, "Parse error"));
  const call = callOf(body);
  if (!isCall(call)) return Response.json(call);
  if (!SUPPORTED_VERSION_HEADER.has(version)) return Response.json(rpcError(call.id, ERROR.version, `A2A version ${version} is not supported; Winyu speaks 0.3`));
  if (call.method === "message/send") return Response.json(await asked(call, user, holder, model));
  return Response.json(await runWithAccess(liveAccessFor(user), () => answerA2a(call, user.id, null, null)));
}
