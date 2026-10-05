import { A2AAgent } from "@mastra/core/a2a";
import type { DataPart, Message, Part, Task } from "@mastra/core/a2a";
import { Agent, type ToolsInput } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import { RequestContext } from "@mastra/core/request-context";
import { InMemoryTaskStore } from "@mastra/server/a2a/store";
import { getAgentExecutionHandler } from "@mastra/server/handlers/a2a";
import type { AccessContext } from "@/lib/contracts";
import { LIMITS } from "@/lib/harness/limits";
import type { WinyuTool } from "@/lib/server/tools/define";
import { USER_ID_KEY, mascopMastra, wrapUpAtLimit } from "./agent";
import { ToolResultInjectionGuard, replyPersonalDataGuard } from "./guardrails";
import { HARNESS_RUN_KEY } from "./observability";
import { mastraTools } from "./tools";

/** The agent other agents talk to: mascop's own chat agent minus the cards, built per caller from the surface the server hands it. */
export const A2A_AGENT_ID = "mascop-a2a";

const SURFACE_KEY = "a2aSurface";
const TOOL_DATA_ARTIFACT = "tool-data";
const TOOL_DATA_NAME = "tool-data.json";

/** What one A2A caller gets: the person it acts as, the tools it may call, the prompt, and the model that answers. */
export type A2aSurface = { userId: string; access: AccessContext; tools: readonly WinyuTool[]; instructions: string; model: MastraModelConfig };

/** The A2A v0.3 JSON-RPC methods mascop serves: one question at a time, then reading or cancelling that task. */
export const A2A_METHODS = ["message/send", "tasks/get", "tasks/cancel"] as const;

export type A2aMethod = (typeof A2A_METHODS)[number];

/** One JSON-RPC call from another agent, already checked to be a method mascop serves. */
export type A2aCall = { id: string | number; method: A2aMethod; params: unknown };

/** A JSON-RPC answer as A2A clients read it: a task or an error. */
export type A2aResponse = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string; data?: unknown } | null };

type A2aContext = { [USER_ID_KEY]: string; [SURFACE_KEY]: A2aSurface; [HARNESS_RUN_KEY]?: string };

type ToolResultChunk = { payload?: { toolName?: unknown; args?: unknown; result?: unknown } };

type Execution = { toolCalls?: unknown; toolResults?: ToolResultChunk[]; [key: string]: unknown };

function surfaceOf(requestContext: RequestContext<A2aContext>): A2aSurface {
  const surface = requestContext.get(SURFACE_KEY);
  if (!surface) throw new Error("an A2A run has no caller surface in its request context");
  return surface;
}

function buildA2aAgent() {
  return new Agent<typeof A2A_AGENT_ID, ToolsInput, undefined, A2aContext>({
    id: A2A_AGENT_ID,
    name: A2A_AGENT_ID,
    instructions: ({ requestContext }) => surfaceOf(requestContext).instructions,
    model: ({ requestContext }) => surfaceOf(requestContext).model,
    tools: ({ requestContext }) => {
      const surface = surfaceOf(requestContext);
      return mastraTools(surface.tools, surface.access);
    },
    outputProcessors: [new ToolResultInjectionGuard(), replyPersonalDataGuard()],
    defaultOptions: { maxSteps: LIMITS.maxSteps, prepareStep: wrapUpAtLimit },
  });
}

let registered = false;

function a2aMastra() {
  const mastra = mascopMastra();
  if (registered) return mastra;
  mastra.addAgent(buildA2aAgent());
  registered = true;
  return mastra;
}

const taskStores = new Map<string, InMemoryTaskStore>();

function taskStoreOf(userId: string): InMemoryTaskStore {
  const existing = taskStores.get(userId);
  if (existing) return existing;
  const created = new InMemoryTaskStore();
  taskStores.set(userId, created);
  return created;
}

function isTask(value: unknown): value is Task {
  return typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === "task";
}

function toolDataOf(execution: Execution): DataPart | null {
  const tools = (execution.toolResults ?? []).flatMap((chunk) => (typeof chunk.payload?.toolName === "string" ? [{ tool: chunk.payload.toolName, args: chunk.payload.args ?? null, result: chunk.payload.result ?? null }] : []));
  return tools.length > 0 ? { kind: "data", data: { tools } } : null;
}

/** A finished task as the caller reads it: the reply as text, plus every tool result it rests on as one data artifact; Mastra's raw execution record is left out. */
export function withToolData(task: Task): Task {
  const { execution, ...metadata } = (task.metadata ?? {}) as { execution?: Execution };
  if (!execution) return task;
  const data = toolDataOf(execution);
  const { toolCalls: _calls, toolResults: _results, ...rest } = execution;
  const artifacts = data ? [...(task.artifacts ?? []), { artifactId: `${task.id}:${TOOL_DATA_ARTIFACT}`, name: TOOL_DATA_NAME, parts: [data] }] : task.artifacts;
  return { ...task, artifacts, metadata: { ...metadata, execution: rest } };
}

/** Answers one A2A call with Mastra's A2A handler, as the caller's person: their own task store (no caller reads another's tasks), the read-only surface for a question, the harness run on the trace. */
export async function answerA2a(call: A2aCall, userId: string, surface: A2aSurface | null, runId: string | null): Promise<A2aResponse> {
  const requestContext = new RequestContext<A2aContext>();
  requestContext.set(USER_ID_KEY, userId);
  if (surface) requestContext.set(SURFACE_KEY, surface);
  if (runId) requestContext.set(HARNESS_RUN_KEY, runId);
  const response: A2aResponse = await getAgentExecutionHandler({
    requestId: call.id,
    mastra: a2aMastra(),
    agentId: A2A_AGENT_ID,
    requestContext: requestContext as RequestContext,
    method: call.method,
    params: call.params as Record<string, unknown>,
    taskStore: taskStoreOf(userId),
    protocolVersion: "0.3",
  });
  return isTask(response.result) ? { ...response, result: withToolData(response.result) } : response;
}

/** Where a remote agent lives and how mascop presents itself to it. */
export type RemoteAgent = { cardUrl: string; headers: Record<string, string>; timeoutMs: number };

/** What a remote agent said: its text and the structured rows it attached, both untrusted until the caller fences them. */
export type RemoteAnswer = { text: string; data: Record<string, unknown>[] };

function partsOf(result: { task?: Task; message?: Message }): Part[] {
  const fromTask = (result.task?.artifacts ?? []).flatMap((artifact) => artifact.parts);
  return fromTask.length > 0 ? fromTask : (result.message?.parts ?? []);
}

/** Asks a remote A2A agent one question through Mastra's `A2AAgent` (card fetched and checked, `message/send`), and returns its text and data parts. */
export async function askRemoteAgent(remote: RemoteAgent, question: string): Promise<RemoteAnswer> {
  const agent = new A2AAgent({ url: remote.cardUrl, headers: remote.headers, timeoutMs: remote.timeoutMs, retries: 0 });
  const result = await agent.generate(question);
  const parts = partsOf(result);
  const text = parts.flatMap((part) => (part.kind === "text" ? [part.text] : [])).join("\n") || result.text;
  const data = parts.flatMap((part) => (part.kind === "data" ? [part.data] : []));
  return { text, data };
}
