import { randomUUID } from "node:crypto";
import { MastraAgent } from "@ag-ui/mastra";
import { CopilotRuntime, InMemoryAgentRunner, createCopilotRuntimeHandler } from "@copilotkit/runtime/v2";
import { RequestContext } from "@mastra/core/request-context";
import { metricQuerySchema, type AccessContext, type Initiator, type MetricQuery } from "@/lib/contracts";
import { askedTool, askedUnder, markAnswered, problemOf, recordAsked } from "@/lib/harness/approvals";
import { checkpointRun, currentRun, emitTo, newRun, runWithRun, saveRun, type Run } from "@/lib/harness/runtime";
import { TH } from "@/lib/i18n/th";
import { toolTiers } from "@/lib/server/agent/tools";
import { recordComposedCard, recordGuardFinding } from "@/lib/server/audit";
import { currentAccess, runWithAccess, runWithTurn, type AnsweredApproval, type TurnContext } from "@/lib/server/request-context";
import { threadForRun, threads } from "@/lib/server/threads-read";
import { AGENT_ID, USER_ID_KEY, winyuAgent } from "./agent";
import { HARNESS_RUN_KEY, tracingOptionsOf } from "./observability";
import { asBridgeAgent } from "./durable";
import { ReplyCards, withComposedCards, type CarriedCall, type ComposedCardRecord } from "./card-stream";
import { callsAnswering, keepFinishedResults, screenCardsOn, threadTranscript } from "./history";
import { guardedRunInput, inputFindings, type GuardedInput } from "./guardrails";
import { learnFromTurn } from "./learn";
import { chatTurnOf, observeReply, type ChatTurn, type FinishedCall, type KnownCalls, type ReplySeen, type RunInput } from "./turn";

const BASE_PATH = "/api/copilotkit";
const INFO_PATH = `${BASE_PATH}/info`;
/** The one run route of the chat agent. */
export const RUN_PATH = `${BASE_PATH}/agent/${AGENT_ID}/run`;
const CONNECT_PATH = `${BASE_PATH}/agent/${AGENT_ID}/connect`;
const STOP_PREFIX = `${BASE_PATH}/agent/${AGENT_ID}/stop/`;
const NOT_YOUR_THREAD = { error: "ไม่พบบทสนทนานี้" };
const NOT_SERVED = { error: "Not found" };
const QUERY_TOOL = "query_metric";
const MEMORY_TOOLS: ReadonlySet<string> = new Set(["remember", "forget"]);
const RESUME_KEY = "resume";

type Route = { kind: "info" } | { kind: "run" } | { kind: "connect" } | { kind: "stop"; threadId: string };

type Handler = (request: Request) => Promise<Response>;

/** How one served run ends: `learn` runs memory extraction and logs the question after a finished turn; an eval recording turns it off so a case costs no extra model call and leaves no memory behind for the next case. `initiator` names who started the run (the person in the web chat unless the caller says otherwise), for the audit and admin rules. */
export type ServeOptions = { learn: boolean; initiator?: Initiator };

/** A served run learns from its finished turn. */
export const LEARNING: ServeOptions = { learn: true };

function bridgeFor(userId: string): MastraAgent {
  const requestContext = new RequestContext();
  requestContext.set(USER_ID_KEY, userId);
  const run = currentRun();
  if (!run) return new MastraAgent({ agentId: AGENT_ID, agent: asBridgeAgent(winyuAgent()), resourceId: userId, requestContext });
  requestContext.set(HARNESS_RUN_KEY, run.id);
  return new MastraAgent({ agentId: AGENT_ID, agent: asBridgeAgent(winyuAgent()), resourceId: userId, requestContext, tracingOptions: tracingOptionsOf(run.id) });
}

let copilotHandler: Handler | null = null;

/** CopilotKit's runtime over the one Mastra agent; each request gets a fresh bridge for the person being served, so no request state is shared between users (D9). A new message on a thread whose earlier run is still going (one resumed after a restart that never ends, a tab closed mid-reply) supersedes that run instead of failing with "Thread already running", so no run can leave its thread dead. */
function handler(): Handler {
  copilotHandler ??= createCopilotRuntimeHandler({
    runtime: new CopilotRuntime({ agents: () => ({ [AGENT_ID]: bridgeFor(currentAccess().userId) }), runner: new InMemoryAgentRunner({ onConcurrentRun: "supersede" }) }),
    basePath: BASE_PATH,
  });
  return copilotHandler;
}

function replyCards(onCard: (record: ComposedCardRecord) => void, carried: readonly CarriedCall[] = []): ReplyCards {
  const tiers = toolTiers();
  return new ReplyCards((tool) => tiers[tool] === "read", onCard, carried);
}

function queriesOf(calls: readonly CarriedCall[]): MetricQuery[] {
  return calls.flatMap((call) => {
    if (call.tool !== QUERY_TOOL) return [];
    const parsed = metricQuerySchema.safeParse(call.args);
    return parsed.success ? [parsed.data] : [];
  });
}

/** What the run that answers an approval carries on from: the calls the asking run (and any earlier answer) finished for the same message; a run that answers nothing starts empty. */
async function carriedCalls(turn: ChatTurn, userId: string): Promise<CarriedCall[]> {
  if (turn.answers.length === 0 || !turn.threadId || !turn.messageId) return [];
  return callsAnswering(turn.threadId, userId, turn.messageId);
}

function answeredCalls(turn: ChatTurn): KnownCalls {
  return new Map(turn.answers.flatMap((answer) => {
    const tool = askedTool(answer.interruptId);
    return tool ? [[answer.toolCallId, tool] as const] : [];
  }));
}

function answeredOf(turn: ChatTurn): AnsweredApproval[] {
  return turn.answers.flatMap((answer) => {
    const tool = askedTool(answer.interruptId);
    return tool ? [{ tool, approved: answer.approved }] : [];
  });
}

function started(run: Run, turn: ChatTurn): void {
  emitTo(run, "runtime", { type: "agent.started", payload: { goal: turn.goal, userId: run.userId, threadId: run.threadId } });
  for (const [toolCallId, tool] of answeredCalls(turn)) {
    const approved = turn.answers.some((answer) => answer.toolCallId === toolCallId && answer.approved);
    emitTo(run, "ui", { type: approved ? "approval.granted" : "approval.denied", payload: { toolCallId, tool } });
  }
}

function lastDecision(run: Run): { stepId: string; finishReason: string } {
  const decision = [...run.events].reverse().find((event) => event.type === "agent.decided");
  return decision?.type === "agent.decided" ? decision.payload : { stepId: `${run.id}:${run.steps}`, finishReason: "none" };
}

/** Whether the person asked this turn to remember or forget something (asked, approved, declined or carried out): the tool did what they asked, so the turn itself is neither learned from nor made findable. */
function changedMemory(run: Run): boolean {
  return run.events.some((event) => {
    const payload: Record<string, unknown> = event.payload;
    return typeof payload.tool === "string" && MEMORY_TOOLS.has(payload.tool);
  });
}

function learnFrom(run: Run, turn: ChatTurn, context: TurnContext): void {
  if (!turn.question) return;
  const finished = { userId: run.userId, threadId: turn.threadId, turnId: run.id, question: turn.question, queries: context.queries, memoryCommand: changedMemory(run) };
  runWithTurn(context, () => learnFromTurn(finished)).catch((error: unknown) => {
    console.error(`memory extraction after run ${run.id} failed`, error);
  });
}

function composed(run: Run, turn: ChatTurn, cards: readonly ComposedCardRecord[]): void {
  for (const card of cards) {
    emitTo(run, "ui", { type: "ui.composed", payload: card });
    recordComposedCard({ ...card, userId: run.userId, runId: run.id, threadId: turn.threadId, question: turn.question });
  }
}

function keepResultsOfPausedRun(run: Run, threadId: string, finished: readonly FinishedCall[]): void {
  keepFinishedResults(run.id, threadId, run.userId, finished).catch((error: unknown) => {
    console.error(`keeping the finished results of paused run ${run.id} failed`, error);
  });
}

function ended(run: Run, turn: ChatTurn, context: TurnContext, seen: ReplySeen, cards: readonly ComposedCardRecord[], options: ServeOptions): void {
  if (seen.results.length > 0) emitTo(run, "ui", { type: "ui.rendered", payload: { stepId: lastDecision(run).stepId, components: seen.results } });
  composed(run, turn, cards);
  for (const asked of seen.asked) {
    recordAsked(asked.interruptId, run.userId, asked.toolCallId, asked.tool, turn.messageId);
    emitTo(run, "runtime", { type: "approval.requested", payload: { toolCallId: asked.toolCallId, tool: asked.tool } });
  }
  if (seen.asked.length > 0 && turn.threadId) keepResultsOfPausedRun(run, turn.threadId, seen.finished);
  if (seen.error) emitTo(run, "runtime", { type: "agent.failed", payload: { reason: seen.error } });
  else emitTo(run, "runtime", { type: "agent.completed", payload: { finishReason: seen.asked.length > 0 ? "awaiting_approval" : lastDecision(run).finishReason } });
  saveRun(run);
  if (options.learn && !seen.error && seen.asked.length === 0) learnFrom(run, turn, context);
}

function refused(run: Run, interruptId: string, problem: string): Response {
  emitTo(run, "runtime", { type: "agent.failed", payload: { reason: `approval ${interruptId} refused: ${problem}` } });
  saveRun(run);
  return Response.json({ error: TH.harness.approvalSpent }, { status: 409 });
}

function readInput(body: string): RunInput {
  try {
    return JSON.parse(body) as RunInput;
  } catch {
    return null;
  }
}

/** Streams one harness run through the agent inside the person's access, turn and run, and ends the run (trace, approvals asked, composed cards, learning) when the reply ends, whether or not anyone is still reading it. */
export async function streamRun(access: AccessContext, req: Request, run: Run, turn: ChatTurn, options: ServeOptions, guarded?: GuardedInput): Promise<Response> {
  if (turn.threadId) threadForRun(turn.threadId, access.userId, turn.question ?? "");
  const threadId = turn.threadId;
  const transcript = threadId ? () => threadTranscript(threadId, access.userId) : undefined;
  const screenCards = threadId ? () => screenCardsOn(threadId, access.userId, turn.messageId, turn.question, context.finished ?? []) : undefined;
  const onScreen = threadId ? (await screenCardsOn(threadId, access.userId, turn.messageId, turn.question, [])).cards : [];
  const carried = await carriedCalls(turn, access.userId);
  const context: TurnContext = { turnId: run.id, threadId, question: turn.question, queries: queriesOf(carried), transcript, screenCards, onScreen, finished: [], answered: answeredOf(turn) };
  if (guarded) runWithTurn(context, () => runWithRun(run, () => inputFindings(guarded).forEach((finding) => recordGuardFinding(finding, access.userId))));
  const records: ComposedCardRecord[] = [];
  const cards = replyCards((record) => records.push(record), carried);
  checkpointRun(run);
  try {
    const response = await runWithAccess(access, () => runWithTurn(context, () => runWithRun(run, () => handler()(req))));
    return observeReply(withComposedCards(response, cards), answeredCalls(turn), (seen) => ended(run, turn, context, seen, records, options));
  } catch (error) {
    emitTo(run, "runtime", { type: "agent.failed", payload: { reason: error instanceof Error ? error.message : String(error) } });
    saveRun(run);
    throw error;
  }
}

function declinedByNewQuestion(turn: ChatTurn): boolean {
  return turn.answers.length > 0 && turn.answers.every((answer) => {
    const askedMessage = askedUnder(answer.interruptId);
    return !answer.approved && askedMessage !== null && askedMessage !== turn.messageId;
  });
}

function withoutAnswers(req: Request, input: RunInput): Request {
  const asked = Object.fromEntries(Object.entries(input ?? {}).filter(([key]) => key !== RESUME_KEY));
  return new Request(req.url, { method: "POST", headers: req.headers, body: JSON.stringify(asked) });
}

async function serveRun(access: AccessContext, req: Request, turn: ChatTurn, guarded: GuardedInput, options: ServeOptions): Promise<Response> {
  const run = newRun(access.userId, turn.threadId, { id: turn.runId, initiator: options.initiator ?? "person" });
  started(run, turn);
  if (turn.answers.length > 1) return refused(run, turn.answers.map((answer) => answer.interruptId).join(", "), "more than one answer in one run");
  const spent = turn.answers.map((answer) => ({ answer, problem: problemOf(answer.interruptId, access.userId, answer.toolCallId) })).find((entry) => entry.problem !== null);
  if (spent) return refused(run, spent.answer.interruptId, spent.problem ?? "unknown");
  for (const answer of turn.answers) markAnswered(answer.interruptId, answer.approved);
  if (declinedByNewQuestion(turn)) return streamRun(access, withoutAnswers(req, guarded.input), run, { ...turn, answers: [] }, options, guarded);
  return streamRun(access, req, run, turn, options, guarded);
}

/** The only runtime routes Winyu serves; debug, inspector, memory, thread and single-route endpoints would bypass the harness run, so they answer 404. */
export function routeOf(method: string, pathname: string): Route | null {
  if (method === "GET") return pathname === INFO_PATH ? { kind: "info" } : null;
  if (method !== "POST") return null;
  if (pathname === RUN_PATH) return { kind: "run" };
  if (pathname === CONNECT_PATH) return { kind: "connect" };
  if (pathname.startsWith(STOP_PREFIX)) return { kind: "stop", threadId: decodeURIComponent(pathname.slice(STOP_PREFIX.length)) };
  return null;
}

function isOthersThread(threadId: string | null, userId: string): boolean {
  const owner = threadId ? threads().get(threadId)?.userId : undefined;
  return owner !== undefined && owner !== userId;
}

/** Serves one CopilotKit request for a signed-in person; no request reaches another person's thread. A run request is one harness run: started with its goal, the agent inside the person's access, turn and run, its trace saved when the reply ends. An approval splits a question into two runs that share the goal: the first ends asking, the second starts with the answer; a new question sent while the card waits declines it and runs as a question of its own. */
export async function serveCopilot(access: AccessContext, req: Request, options: ServeOptions = LEARNING): Promise<Response> {
  const route = routeOf(req.method, new URL(req.url).pathname);
  if (!route) return Response.json(NOT_SERVED, { status: 404 });
  if (route.kind === "info") return runWithAccess(access, () => handler()(req));
  const raw = await req.text();
  const guarded = guardedRunInput(readInput(raw));
  const body = guarded.input ? JSON.stringify(guarded.input) : raw;
  const turn = chatTurnOf(guarded.input, randomUUID());
  const threadId = route.kind === "stop" ? route.threadId : turn.threadId;
  if (isOthersThread(threadId, access.userId)) return Response.json(NOT_YOUR_THREAD, { status: 404 });
  const replayed = new Request(req.url, { method: "POST", headers: req.headers, body });
  if (route.kind === "run") return serveRun(access, replayed, turn, guarded, options);
  const response = await runWithAccess(access, () => handler()(replayed));
  return route.kind === "connect" ? withComposedCards(response, replyCards(() => undefined)) : response;
}
