import { randomUUID } from "node:crypto";
import type { LanguageModelMiddleware } from "ai";
import type { RunLimit } from "@/lib/harness/events";
import type { AccessContext } from "@/lib/contracts";
import { runWithAccess, runWithTurn } from "@/lib/server/request-context";
import { markAnswered, problemOf, recordAsked } from "@/lib/harness/approvals";
import { transcriptWindow } from "@/lib/harness/context";
import { LIMITS } from "@/lib/harness/limits";
import { currentRun, emitTo, newRun, runWithRun, saveRun, type Run } from "@/lib/harness/runtime";
import { chatTurnOf, type ChatBody, type ChatTurn } from "./events";
import { TH } from "@/lib/i18n/th";
import type { HostPrepareStep } from "./server";
import { observeReply, type ReplySeen } from "./ui";

/** What Winyu needs from an agent engine: publish its models, and answer one chat request with a streamed reply. */
export type AgentEngine = { GET(): Promise<Response>; POST(req: Request): Promise<Response> };

type FinishChunk = { type: "finish"; finishReason?: { unified?: string } | string };

function reasonOf(chunk: FinishChunk): string {
  const reason = chunk.finishReason;
  return typeof reason === "string" ? reason : (reason?.unified ?? "unknown");
}

function stepStarted(run: Run): string {
  run.steps += 1;
  const stepId = `${run.id}:${run.steps}`;
  emitTo(run, "model", { type: "agent.thinking", payload: { stepId, step: run.steps } });
  return stepId;
}

/** Records each model call of a run as one step: that it started, the tools it asked for, and how it finished. */
export function traceMiddleware(): LanguageModelMiddleware {
  return {
    specificationVersion: "v3",
    wrapGenerate: async ({ doGenerate }) => {
      const run = currentRun();
      const stepId = run ? stepStarted(run) : null;
      const result = await doGenerate();
      if (!run || !stepId) return result;
      const toolCalls = result.content.flatMap((part) => (part.type === "tool-call" ? [part] : []));
      for (const call of toolCalls) emitTo(run, "model", { type: "agent.tool.requested", payload: { stepId, toolCallId: call.toolCallId, tool: call.toolName } });
      emitTo(run, "model", { type: "agent.decided", payload: { stepId, finishReason: reasonOf({ type: "finish", finishReason: result.finishReason }), toolCalls: toolCalls.map((call) => call.toolName) } });
      return result;
    },
    wrapStream: async ({ doStream }) => {
      const run = currentRun();
      const stepId = run ? stepStarted(run) : null;
      const { stream, ...rest } = await doStream();
      if (!run || !stepId) return { stream, ...rest };
      const requested: string[] = [];
      const traced = stream.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            if (chunk.type === "tool-call") {
              requested.push(chunk.toolName);
              emitTo(run, "model", { type: "agent.tool.requested", payload: { stepId, toolCallId: chunk.toolCallId, tool: chunk.toolName } });
            }
            if (chunk.type === "finish") emitTo(run, "model", { type: "agent.decided", payload: { stepId, finishReason: reasonOf(chunk as FinishChunk), toolCalls: requested } });
            controller.enqueue(chunk);
          },
        }),
      );
      return { stream: traced, ...rest };
    },
  };
}

function limitReached(run: Run, stepNumber: number): RunLimit | null {
  if (stepNumber >= LIMITS.maxSteps - 1) return "steps";
  return run.toolCalls >= run.toolBudget ? "tool_calls" : null;
}

/** Before each model call: on the last call a run may make, or once its tool budget is spent, the model gets no tools and is told to sum up what it has, say what is missing and ask how to go on. */
export function wrapUpAtLimit(): HostPrepareStep {
  return ({ stepNumber, system }) => {
    const run = currentRun();
    const limit = run ? limitReached(run, stepNumber) : stepNumber >= LIMITS.maxSteps - 1 ? "steps" : null;
    if (!limit) return undefined;
    if (run) emitTo(run, "runtime", { type: "agent.limited", payload: { limit, step: stepNumber + 1 } });
    return { toolChoice: "none", system: `${system}\n${TH.harness.wrapUp}` };
  };
}

function started(run: Run, turn: ChatTurn): void {
  emitTo(run, "runtime", { type: "agent.started", payload: { goal: turn.goal, userId: run.userId, threadId: run.threadId } });
  if (turn.pressedTool) emitTo(run, "ui", { type: "ui.action", payload: { tool: turn.pressedTool } });
  for (const answer of turn.approvals) {
    emitTo(run, "ui", { type: answer.approved ? "approval.granted" : "approval.denied", payload: { toolCallId: answer.toolCallId, tool: answer.tool } });
  }
}

function ended(run: Run, seen: ReplySeen): void {
  const lastDecision = [...run.events].reverse().find((event) => event.type === "agent.decided");
  const stepId = lastDecision?.type === "agent.decided" ? lastDecision.payload.stepId : `${run.id}:${run.steps}`;
  if (seen.components.length > 0) emitTo(run, "ui", { type: "ui.rendered", payload: { stepId, components: seen.components } });
  for (const asked of seen.approvalsAsked) {
    recordAsked(asked.approvalId, run.userId, asked.toolCallId, asked.tool);
    emitTo(run, "runtime", { type: "approval.requested", payload: { toolCallId: asked.toolCallId, tool: asked.tool } });
  }
  if (seen.error) emitTo(run, "runtime", { type: "agent.failed", payload: { reason: seen.error } });
  else emitTo(run, "runtime", { type: "agent.completed", payload: { finishReason: lastDecision?.type === "agent.decided" ? lastDecision.payload.finishReason : "none" } });
  saveRun(run);
}

function windowed(run: Run, body: ChatBody): ChatBody {
  if (!Array.isArray(body?.messages)) return body;
  const { kept, dropped } = transcriptWindow(body.messages, LIMITS.maxTranscriptChars, LIMITS.minTranscriptMessages);
  if (dropped === 0) return body;
  emitTo(run, "runtime", { type: "context.trimmed", payload: { droppedMessages: dropped, keptMessages: kept.length } });
  return { ...body, messages: kept };
}

function refuseAnswer(run: Run, approvalId: string, problem: string): Response {
  emitTo(run, "runtime", { type: "agent.failed", payload: { reason: `approval ${approvalId} refused: ${problem}` } });
  saveRun(run);
  return Response.json({ error: TH.harness.approvalSpent }, { status: 409 });
}

/** Serves one chat request as one harness run: the run and goal first, the engine inside the person's access, the run's trace saved when the reply ends. */
export async function serveChat(access: AccessContext, req: Request, engine: (access: AccessContext) => AgentEngine, runId: string = randomUUID()): Promise<Response> {
  const body = JSON.parse(await req.text()) as ChatBody;
  const turn = chatTurnOf(body, runId);
  const run = newRun(access.userId, turn.threadId, { id: runId });
  started(run, turn);
  const spent = turn.approvals.find((answer) => problemOf(answer.approvalId, access.userId, answer.toolCallId) !== null);
  if (spent) return refuseAnswer(run, spent.approvalId, problemOf(spent.approvalId, access.userId, spent.toolCallId) ?? "unknown");
  for (const answer of turn.approvals) markAnswered(answer.approvalId);
  const replayed = new Request(req.url, { method: "POST", headers: req.headers, body: JSON.stringify(windowed(run, body)) });
  const context = { turnId: run.id, threadId: turn.threadId, preloadPacketId: turn.preloadPacketId, question: turn.question, queries: [] };
  try {
    const response = await runWithAccess(access, () => runWithTurn(context, () => runWithRun(run, () => engine(access).POST(replayed))));
    return observeReply(response, (seen) => ended(run, seen));
  } catch (error) {
    emitTo(run, "runtime", { type: "agent.failed", payload: { reason: error instanceof Error ? error.message : String(error) } });
    saveRun(run);
    throw error;
  }
}
