import { randomUUID } from "node:crypto";
import { liveAccessFor } from "@/lib/access/enforce";
import type { MetricQuery } from "@/lib/contracts";
import { forgetAll } from "@/lib/engine/memory";
import { isTrusted } from "@/lib/engine/memory-status";
import { findUser } from "@/lib/data/entities/users";
import { promptHash, toolsHash } from "@/lib/eval/fingerprint";
import { drawingOf, turnOf, type RecordedBefore, type RecordedStep, type RecordedUsage, type Recording } from "@/lib/eval/recording";
import { memoryFacts } from "@/lib/server/agent/collections";
import { agentModel } from "@/lib/server/models";
import { measure, type Metered } from "@/lib/server/usage-meter";
import { storedMessages, type StoredMessage } from "./history";
import { learnFromTurn } from "./learn";
import { forgetConversations } from "./recall";
import { serveCopilot } from "./serve";

const RUN_URL = "http://localhost/api/copilotkit/agent/winyu/run";
const SSE_DATA = "data:";
const RESULT_STATE = "result";
const METRIC_TOOL = "query_metric";
const NO_MEMORY = { learn: false };

/** One question to record: the case it belongs to, who asks and what, and what the same person asked earlier, each in its own thread. */
export type RecordRequest = { caseId: string; userId: string; prompt: string; before?: readonly string[] };

type AgUiEvent = { type?: string; message?: string; outcome?: { type?: string; interrupts?: { metadata?: { mastra?: { toolName?: string } } }[] } };
type StoredPart = { type?: unknown; text?: unknown; toolInvocation?: { state?: unknown; toolName?: unknown; args?: unknown; result?: unknown } };

function eventsOf(sse: string): AgUiEvent[] {
  return sse.split("\n").flatMap((line) => {
    if (!line.startsWith(SSE_DATA)) return [];
    try {
      return [JSON.parse(line.slice(SSE_DATA.length)) as AgUiEvent];
    } catch {
      return [];
    }
  });
}

function askedOf(events: readonly AgUiEvent[]): string[] {
  const finished = events.find((event) => event.type === "RUN_FINISHED");
  if (finished?.outcome?.type !== "interrupt") return [];
  return (finished.outcome.interrupts ?? []).flatMap((interrupt) => (interrupt.metadata?.mastra?.toolName ? [interrupt.metadata.mastra.toolName] : []));
}

function errorOf(events: readonly AgUiEvent[], status: number): string | null {
  const failed = events.find((event) => event.type === "RUN_ERROR");
  if (failed) return failed.message ?? "run error";
  return status === 200 ? null : `HTTP ${status}`;
}

function stepOf(part: StoredPart): RecordedStep[] {
  if (part.type === "text" && typeof part.text === "string" && part.text.trim()) return [{ kind: "text", text: part.text }];
  const call = part.toolInvocation;
  if (part.type !== "tool-invocation" || !call || typeof call.toolName !== "string") return [];
  return [{ kind: "call", tool: call.toolName, args: call.args ?? {}, ...(call.state === RESULT_STATE ? { result: call.result } : {}) }];
}

function stepsOf(messages: readonly StoredMessage[]): RecordedStep[] {
  return messages.filter((message) => message.role === "assistant").flatMap((message) => {
    const parts = (message.content as { parts?: unknown } | null)?.parts;
    return Array.isArray(parts) ? (parts as StoredPart[]).flatMap(stepOf) : [];
  });
}

function usageOf(metered: Metered): RecordedUsage {
  const usd = metered.billedCalls === metered.calls ? metered.billedUsd : Math.max(metered.billedUsd, metered.estimatedUsd);
  return { calls: metered.calls, inputTokens: metered.inputTokens, outputTokens: metered.outputTokens, reasoningTokens: metered.reasoningTokens, usd };
}

async function ask(userId: string, threadId: string, prompt: string): Promise<{ status: number; events: AgUiEvent[] }> {
  const user = findUser(userId);
  if (!user) throw new Error(`no user ${userId}`);
  const body = { threadId, runId: randomUUID(), state: {}, messages: [{ id: randomUUID(), role: "user", content: prompt }], tools: [], context: [], forwardedProps: {} };
  const request = new Request(RUN_URL, { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(body) });
  const response = await serveCopilot(liveAccessFor(user), request, NO_MEMORY);
  return { status: response.status, events: eventsOf(await response.text()) };
}

function queriesOf(steps: readonly RecordedStep[]): MetricQuery[] {
  return steps.flatMap((step) => {
    if (step.kind !== "call" || step.tool !== METRIC_TOOL) return [];
    const query = (step.result as { ok?: unknown; query?: unknown } | undefined)?.query;
    return typeof query === "object" && query !== null ? [query as MetricQuery] : [];
  });
}

/** Asks one earlier question in its own thread and learns from it the way a served turn does, waiting for memory and recall to finish. */
async function askBefore(userId: string, caseId: string, prompt: string): Promise<RecordedBefore> {
  const threadId = `eval-${caseId}-before-${randomUUID()}`;
  await ask(userId, threadId, prompt);
  const steps = stepsOf(await storedMessages(threadId, userId));
  await learnFromTurn({ userId, threadId, turnId: randomUUID(), question: prompt, queries: queriesOf(steps) });
  return { prompt, steps };
}

function trustedFacts(userId: string): string[] {
  return memoryFacts().where((fact) => fact.userId === userId && isTrusted(fact)).map((fact) => fact.value);
}

async function askCase(request: RecordRequest, threadId: string) {
  const before: RecordedBefore[] = [];
  for (const prompt of request.before ?? []) before.push(await askBefore(request.userId, request.caseId, prompt));
  const remembered = trustedFacts(request.userId);
  return { before, remembered, asked: await ask(request.userId, threadId, request.prompt) };
}

async function forgetCase(userId: string): Promise<void> {
  forgetAll(userId);
  await forgetConversations(userId);
}

/** Asks the real model one case's question through the same route the chat uses (gateway, approvals, card stream), with memory extraction off, and returns what it did as a recording. A case with earlier questions asks each in its own thread first and learns from it as the chat does, then forgets it all so the next case starts clean. */
export async function recordCase(request: RecordRequest): Promise<Recording> {
  const model = agentModel();
  if (!model) throw new Error("OPENROUTER_API_KEY is not set: a live recording needs the real model");
  const threadId = `eval-${request.caseId}-${randomUUID()}`;
  const hasBefore = (request.before ?? []).length > 0;
  try {
    const { result, usage } = await measure(() => askCase(request, threadId));
    const recording: Recording = {
      version: 1,
      caseId: request.caseId,
      userId: request.userId,
      prompt: request.prompt,
      model: model.id,
      promptHash: promptHash(request.userId),
      toolsHash: toolsHash(request.userId),
      today: new Date().toISOString().slice(0, 10),
      recordedAt: new Date().toISOString(),
      steps: stepsOf(await storedMessages(threadId, request.userId)),
      asked: askedOf(result.asked.events),
      error: errorOf(result.asked.events, result.asked.status),
      usage: usageOf(usage),
      drawn: { cards: [], composed: null },
      ...(hasBefore ? { before: result.before, remembered: result.remembered } : {}),
    };
    return { ...recording, drawn: drawingOf(turnOf(recording)) };
  } finally {
    if (hasBefore) await forgetCase(request.userId);
  }
}
