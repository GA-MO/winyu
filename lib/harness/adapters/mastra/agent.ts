import path from "node:path";
import { Agent, type AgentExecutionOptions, type ToolsInput } from "@mastra/core/agent";
import { Mastra } from "@mastra/core";
import { MASTRA_RESOURCE_ID_KEY, type RequestContext } from "@mastra/core/request-context";
import type { CoreSystemMessage } from "@mastra/core/llm";
import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";
import type { LanguageModel } from "ai";
import { liveAccessFor } from "@/lib/access/enforce";
import type { AccessContext } from "@/lib/contracts";
import { businessToday } from "@/lib/data/dates";
import { findUser } from "@/lib/data/entities/users";
import type { RunLimit } from "@/lib/harness/events";
import { LIMITS } from "@/lib/harness/limits";
import { currentRun, emitTo, type Run } from "@/lib/harness/runtime";
import { TH } from "@/lib/i18n/th";
import { WINYU_RULES, personaFor } from "@/lib/server/agent/persona";
import { toolsForAccess } from "@/lib/server/agent/tools";
import { CACHED_SYSTEM_PROMPT, agentModel } from "@/lib/server/models";
import { currentTurn } from "@/lib/server/request-context";
import { adoptGeneratedTitle } from "@/lib/server/threads-read";
import { DATA_DIR } from "@/lib/server/store/json-store";
import { ToolResultInjectionGuard, replyGuard } from "./guardrails";
import { ChatDurableAgent, persistsSnapshot } from "./durable";
import { HistoryTrim } from "./history-trim";
import { winyuWorkflows, schedulerEnabled } from "./jobs";
import { HARNESS_RUN_KEY, winyuObservability } from "./observability";
import { mastraTools } from "./tools";

/** The one chat agent's id: the Mastra registry key and the CopilotKit agent name. */
export const AGENT_ID = "winyu";

/** The request-context key that carries the signed-in user's id into instructions and tools. */
export const USER_ID_KEY = "userId";

const STORAGE_FILE = "mastra.db";
const STUDIO_RESOURCE_PREFIX = "studio:";
const REMEMBERED_MESSAGES = 20;
const PROMPT_SEPARATOR = "\n\n";
const NO_MODEL = "OPENROUTER_API_KEY is not set: the chat agent has no model";
/** No chat step in the traces took more than 12 s to send its first content chunk (reasoning summaries count; about 150 steps, median 3.5 s), so 20 s of silence means the provider is stuck and the fallback should start. */
const FIRST_CHUNK_MS = 20_000;
/** The longest chat step measured took 47 s (a long reply); AI-341's step sent reasoning at 5.6 s and then nothing for 235 s, a stall only this budget catches. */
const STEP_MS = 60_000;
/** Longer than any run measured (42 s) plus one failed-over step, and about as long as a person waits; Mastra re-arms it for each session, so a run that pauses for an approval or recovers after a restart gets it afresh. */
const TOTAL_MS = 150_000;
const BUDGET_ENV = "WINYU_CHAT_BUDGET_MS";
const PRODUCTION = "production";

/** How long a chat run may take: a step that sends no content within `firstChunkMs`, or runs past `stepMs`, fails over to the next model; a run past `totalMs` fails. */
export type ChatTimeBudget = { firstChunkMs: number; stepMs: number; totalMs: number };

/** The chat's time budgets; outside production WINYU_CHAT_BUDGET_MS ("first,step,total" in ms) replaces them, so a test or a demo can make a stall time out in seconds. */
export function chatTimeBudget(): ChatTimeBudget {
  const override = process.env[BUDGET_ENV]?.trim();
  if (!override || process.env.NODE_ENV === PRODUCTION) return { firstChunkMs: FIRST_CHUNK_MS, stepMs: STEP_MS, totalMs: TOTAL_MS };
  const [firstChunkMs, stepMs, totalMs] = override.split(",").map(Number);
  if (![firstChunkMs, stepMs, totalMs].every((ms) => Number.isFinite(ms) && ms > 0)) throw new Error(`${BUDGET_ENV} must be three positive numbers of ms: first,step,total`);
  return { firstChunkMs, stepMs, totalMs };
}

type UserContext = { [USER_ID_KEY]: string; [MASTRA_RESOURCE_ID_KEY]?: string };

type PrepareStep = NonNullable<AgentExecutionOptions["prepareStep"]>;

/** The memory resource a persona's Studio threads live under, apart from its threads in the app (keyed by its user id). */
export function studioResourceOf(userId: string): string {
  return `${STUDIO_RESOURCE_PREFIX}${userId}`;
}

function personaAccessOf(requestContext: RequestContext<UserContext>): AccessContext | null {
  const userId = requestContext.get(USER_ID_KEY);
  const user = typeof userId === "string" ? findUser(userId) : null;
  if (!user) return null;
  const resource = requestContext.get(MASTRA_RESOURCE_ID_KEY);
  if (resource !== undefined && resource !== user.id && resource !== studioResourceOf(user.id)) throw new Error(`memory resource ${String(resource)} does not belong to ${user.id}`);
  return liveAccessFor(user);
}

const NO_PERSONA: CoreSystemMessage = { role: "system", content: TH.harness.studioPickPersona };

function instructionsOf(requestContext: RequestContext<UserContext>): CoreSystemMessage {
  const access = personaAccessOf(requestContext);
  return access ? instructionsFor(access) : NO_PERSONA;
}

function instructionsFor(access: AccessContext): CoreSystemMessage {
  const turn = currentTurn();
  const context = { threadId: turn.threadId };
  const lines = personaFor(access, findUser(access.userId), { today: businessToday(), context }, WINYU_RULES);
  return { role: "system", content: lines.join(PROMPT_SEPARATOR), providerOptions: CACHED_SYSTEM_PROMPT };
}

function limitReached(run: Run | null, stepNumber: number): RunLimit | null {
  if (stepNumber >= LIMITS.maxSteps - 1) return "steps";
  if (!run) return null;
  return run.toolCalls >= run.toolBudget ? "tool_calls" : null;
}

/** Before each model call: on the last call a run may make, or once its tool budget is spent, the model gets no tools and is told to sum up what it has, say what is missing and ask how to go on. */
export const wrapUpAtLimit: PrepareStep = ({ stepNumber, systemMessages }) => {
  const run = currentRun();
  const limit = limitReached(run, stepNumber);
  if (!limit) return undefined;
  if (run) emitTo(run, "runtime", { type: "agent.limited", payload: { limit, step: stepNumber + 1 } });
  return { toolChoice: "none", systemMessages: [...systemMessages, { role: "system", content: TH.harness.wrapUp }] };
};

function answersTold(): CoreSystemMessage[] {
  return (currentTurn().answered ?? []).map(({ tool, approved }) => ({ role: "system", content: approved ? TH.harness.answeredYes(tool) : TH.harness.answeredNo(tool) }));
}

const toldTheAnswerThenWrapUp: PrepareStep = (step) => {
  const told = answersTold();
  const systemMessages = [...step.systemMessages, ...told];
  return wrapUpAtLimit({ ...step, systemMessages }) ?? (told.length > 0 ? { systemMessages } : undefined);
};

function configuredModel() {
  const model = agentModel();
  if (!model) throw new Error(NO_MODEL);
  return model;
}

/** The chat model first (flex tier), then the same model on the standard tier once; neither is retried on its own, since a timed-out call is not worth repeating on the tier that stalled. */
const CHAT_MODELS = [
  { id: "flex", model: () => configuredModel().chat(), maxRetries: 0 },
  { id: "standard", model: () => configuredModel().chatFallback(), maxRetries: 0 },
];

const NOTHING_USED = { inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 0, text: 0, reasoning: 0 } };

/** A title model that says nothing and calls no one: a run that is not a served chat run (a Studio run) gets no title and spends nothing. */
const NO_TITLE: Extract<LanguageModel, { specificationVersion: "v3" }> = {
  specificationVersion: "v3",
  provider: "winyu",
  modelId: "no-title",
  supportedUrls: {},
  doGenerate: async () => ({ content: [], finishReason: { unified: "stop", raw: undefined }, usage: NOTHING_USED, warnings: [] }),
  doStream: async () => ({ stream: new ReadableStream({ start: (controller) => controller.close() }) }),
};

/** The model that names a thread after its first answer: the cheap title model, billed as background work to the person whose served chat run it follows; anything else (Studio) gets NO_TITLE. */
function titleModelFor({ requestContext }: { requestContext: RequestContext }) {
  const userId = requestContext.get(USER_ID_KEY);
  const runId = requestContext.get(HARNESS_RUN_KEY);
  if (typeof userId !== "string" || typeof runId !== "string") return NO_TITLE;
  return configuredModel().title({ source: "background", userId, turnId: runId });
}

/** Mastra memory that hands each generated title to the thread store, which keeps it only on the person's own thread and only while the first question still names it. */
class ChatMemory extends Memory {
  override async updateThread(args: Parameters<Memory["updateThread"]>[0]) {
    const thread = await super.updateThread(args);
    if (args.title) adoptGeneratedTitle(thread.id, thread.resourceId, args.title);
    return thread;
  }
}

function buildMastra(): Mastra {
  const storage = new LibSQLStore({ id: AGENT_ID, url: `file:${path.join(DATA_DIR, STORAGE_FILE)}` });
  const agent = new Agent<typeof AGENT_ID, ToolsInput, undefined, UserContext>({
    id: AGENT_ID,
    name: AGENT_ID,
    instructions: ({ requestContext }) => instructionsOf(requestContext),
    model: CHAT_MODELS,
    tools: ({ requestContext }) => {
      const access = personaAccessOf(requestContext);
      return access ? mastraTools(toolsForAccess(access), access) : {};
    },
    memory: new ChatMemory({ options: { lastMessages: REMEMBERED_MESSAGES, semanticRecall: false, generateTitle: { model: titleModelFor, instructions: TH.harness.titleInstructions } } }),
    inputProcessors: [new HistoryTrim()],
    outputProcessors: [new ToolResultInjectionGuard(), replyGuard()],
    defaultOptions: () => ({ maxSteps: LIMITS.maxSteps, prepareStep: toldTheAnswerThenWrapUp, modelSettings: { timeout: chatTimeBudget() } }),
  });
  const durable = new ChatDurableAgent({ agent, shouldPersistSnapshot: persistsSnapshot });
  return new Mastra({ agents: { [AGENT_ID]: durable }, workflows: winyuWorkflows(), scheduler: { enabled: schedulerEnabled() }, storage, observability: winyuObservability(USER_ID_KEY) });
}

let mastra: Mastra | null = null;

/** The one Mastra instance of this process: the chat agent, its storage and its tracing. */
export function winyuMastra(): Mastra {
  mastra ??= buildMastra();
  return mastra;
}

/** The chat agent, built once per server as a durable agent: instructions and tools are resolved per request from the user in its request context (D3, D9), a run that answers an approval is told the answer before each model call, and its run state is checkpointed so a run outlives the connection and the process. */
export function winyuAgent(): ChatDurableAgent {
  const agent = winyuMastra().getAgent(AGENT_ID);
  if (!(agent instanceof ChatDurableAgent)) throw new Error(`agent ${AGENT_ID} is not the durable chat agent`);
  return agent;
}
