import { randomUUID } from "node:crypto";
import { liveAccessFor } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import { promptHash, toolsHash } from "@/lib/eval/fingerprint";
import { drawingOf, turnOf, type RecordedStep, type RecordedUsage, type Recording } from "@/lib/eval/recording";
import { agentModel } from "@/lib/server/models";
import { measure, type Metered } from "@/lib/server/usage-meter";
import { storedMessages, type StoredMessage } from "./history";
import { serveCopilot } from "./serve";

const RUN_URL = "http://localhost/api/copilotkit/agent/mascop/run";
const SSE_DATA = "data:";
const RESULT_STATE = "result";
const NO_MEMORY = { learn: false };

/** One question to record: the case it belongs to, who asks and what. */
export type RecordRequest = { caseId: string; userId: string; prompt: string };

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
  return (finished.outcome.interrupts ?? []).map((interrupt) => interrupt.metadata?.mastra?.toolName ?? "unknown");
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

/** Asks the real model one case's question through the same route the chat uses (gateway, approvals, card stream), with memory extraction off, and returns what it did as a recording. */
export async function recordCase(request: RecordRequest): Promise<Recording> {
  const model = agentModel();
  if (!model) throw new Error("OPENROUTER_API_KEY is not set: a live recording needs the real model");
  const threadId = `eval-${request.caseId}-${randomUUID()}`;
  const { result, usage } = await measure(() => ask(request.userId, threadId, request.prompt));
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
    asked: askedOf(result.events),
    error: errorOf(result.events, result.status),
    usage: usageOf(usage),
    drawn: { cards: [], composed: null },
  };
  return { ...recording, drawn: drawingOf(turnOf(recording)) };
}
