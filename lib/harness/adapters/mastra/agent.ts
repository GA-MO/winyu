import path from "node:path";
import { Agent, type AgentExecutionOptions, type ToolsInput } from "@mastra/core/agent";
import { Mastra } from "@mastra/core";
import type { RequestContext } from "@mastra/core/request-context";
import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";
import { liveAccessFor } from "@/lib/access/enforce";
import type { AccessContext } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import type { RunLimit } from "@/lib/harness/events";
import { LIMITS } from "@/lib/harness/limits";
import { currentRun, emitTo, type Run } from "@/lib/harness/runtime";
import { TH } from "@/lib/i18n/th";
import { WINYU_RULES, personaFor } from "@/lib/server/agent/persona";
import { toolsForAccess } from "@/lib/server/agent/tools";
import { agentModel } from "@/lib/server/models";
import { currentTurn } from "@/lib/server/request-context";
import { DATA_DIR } from "@/lib/server/store/json-store";
import { ToolResultInjectionGuard, replyPersonalDataGuard } from "./guardrails";
import { mascopObservability } from "./observability";
import { mastraTools } from "./tools";

/** The one chat agent's id: the Mastra registry key and the CopilotKit agent name. */
export const AGENT_ID = "mascop";

/** The request-context key that carries the signed-in user's id into instructions and tools. */
export const USER_ID_KEY = "userId";

const STORAGE_FILE = "mastra.db";
const REMEMBERED_MESSAGES = 20;
const PROMPT_SEPARATOR = "\n\n";
const NO_MODEL = "OPENROUTER_API_KEY is not set: the chat agent has no model";

type UserContext = { [USER_ID_KEY]: string };

type PrepareStep = NonNullable<AgentExecutionOptions["prepareStep"]>;

function accessOf(requestContext: RequestContext<UserContext>): AccessContext {
  const userId = requestContext.get(USER_ID_KEY);
  const user = typeof userId === "string" ? findUser(userId) : null;
  if (!user) throw new Error(`no user ${String(userId)} in the request context`);
  return liveAccessFor(user);
}

function instructionsFor(access: AccessContext): string {
  const turn = currentTurn();
  const context = { threadId: turn.threadId, preloadPacketId: turn.preloadPacketId };
  const persona = personaFor(access, findUser(access.userId), { today: new Date().toISOString().slice(0, 10), context });
  return [...persona, ...WINYU_RULES].join(PROMPT_SEPARATOR);
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

function chatModel() {
  const model = agentModel();
  if (!model) throw new Error(NO_MODEL);
  return model.model();
}

function buildMastra(): Mastra {
  const storage = new LibSQLStore({ id: AGENT_ID, url: `file:${path.join(DATA_DIR, STORAGE_FILE)}` });
  const agent = new Agent<typeof AGENT_ID, ToolsInput, undefined, UserContext>({
    id: AGENT_ID,
    name: AGENT_ID,
    instructions: ({ requestContext }) => instructionsFor(accessOf(requestContext)),
    model: chatModel,
    tools: ({ requestContext }) => {
      const access = accessOf(requestContext);
      return mastraTools(toolsForAccess(access), access);
    },
    memory: new Memory({ options: { lastMessages: REMEMBERED_MESSAGES, semanticRecall: false, generateTitle: false } }),
    outputProcessors: [new ToolResultInjectionGuard(), replyPersonalDataGuard()],
    defaultOptions: { maxSteps: LIMITS.maxSteps, prepareStep: wrapUpAtLimit },
  });
  return new Mastra({ agents: { [AGENT_ID]: agent }, storage, observability: mascopObservability(USER_ID_KEY) });
}

let mastra: Mastra | null = null;

/** The one Mastra instance of this process: the chat agent, its storage and its tracing. */
export function mascopMastra(): Mastra {
  mastra ??= buildMastra();
  return mastra;
}

/** The chat agent, built once per server: instructions and tools are resolved per request from the user in its request context (D3, D9). */
export function mascopAgent() {
  return mascopMastra().getAgent(AGENT_ID);
}
