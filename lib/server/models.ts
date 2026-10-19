import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { wrapLanguageModel, type LanguageModel, type LanguageModelMiddleware } from "ai";
import { traceMiddleware } from "@/lib/harness/trace";
import { meterMiddleware, type CallOwner } from "./usage-meter";

const OPENROUTER_APP_URL = "http://localhost:3100";
const DEFAULT_OPENROUTER_MODEL = "google/gemini-3.8-flash";
const MODEL_NAMES: Record<string, string> = { "google/gemini-3.8-flash": "Gemini 3.8 Flash" };
const PROVIDER_ORDER: Record<string, string[]> = { "google/gemini-3.8-flash": ["google-ai-studio/flex", "google-ai-studio"] };
const FALLBACK_PROVIDER_ORDER: Record<string, string[]> = { "google/gemini-3.8-flash": ["google-ai-studio"] };
/** A background call has no person waiting and thinks as long as the model likes (once 145 s, AI-133); twice that only cuts a call that will never answer. */
const BACKGROUND_CALL_MS = 300_000;
/** A title is a few words; a call still silent after this will not arrive in time to be useful. */
const TITLE_CALL_MS = 30_000;
const STALL_FLEX_ENV = "WINYU_DEV_STALL_FLEX";
const PRODUCTION = "production";
const REASONING_EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh"] as const;
const MODEL_DEFAULT_EFFORT = "default";
const CHAT_REASONING_EFFORT_ENV = "OPENROUTER_CHAT_REASONING_EFFORT";
const CHAT_REASONING_EFFORT: Record<string, ReasoningEffort> = { "google/gemini-3.8-flash": "medium" };
const TITLE_REASONING_EFFORT: ReasoningEffort = "minimal";

/** Provider options that mark a system message for OpenRouter's explicit prompt cache: Gemini's implicit cache missed byte-identical repeats, the marked prompt is read back at a quarter of the input price; the cache holds the tool definitions and the whole system prompt. */
export const CACHED_SYSTEM_PROMPT = { openrouter: { cacheControl: { type: "ephemeral" } } };

/** The one real model, with the id it is billed and traced under: `chat` for the chat agent a person waits on, with reasoning bounded; `chatFallback`, the same model on the standard tier, for a chat step the first tier stalled or failed; `model` for background work, thinking as long as the model likes; `title` for a thread's title, billed as background work for the person it names. */
export type AgentModel = { id: string; name: string; chat: () => MeteredModel; chatFallback: () => MeteredModel; model: () => MeteredModel; title: (owner: CallOwner) => MeteredModel };

type MeteredModel = ReturnType<typeof wrapLanguageModel>;

type WrappableModel = Parameters<typeof wrapLanguageModel>[0]["model"];

type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

function isReasoningEffort(value: string): value is ReasoningEffort {
  return (REASONING_EFFORTS as readonly string[]).includes(value);
}

/** Where OpenRouter sends a model first: one provider keeps the prompt cache shared across users, the flex tier halves the price, fallbacks stay allowed; OPENROUTER_PROVIDER_ORDER (comma list, e.g. "google-ai-studio") overrides it. */
function providerOrderOf(modelId: string): string[] | null {
  const override = (process.env.OPENROUTER_PROVIDER_ORDER ?? "").split(",").map((slug) => slug.trim()).filter(Boolean);
  if (override.length > 0) return override;
  return PROVIDER_ORDER[modelId] ?? null;
}

/** How hard the model may think before a chat step: medium keeps every demo turn under 40 s with answers as good as the model's own default, which once thought for 145 s; low is three times faster but chose worse in two demo questions (docs/issues/ai-answers.md AI-133). OPENROUTER_CHAT_REASONING_EFFORT (one of REASONING_EFFORTS, or "default" for the model's own) overrides it. */
function chatReasoningEffortOf(modelId: string): ReasoningEffort | null {
  const override = process.env[CHAT_REASONING_EFFORT_ENV]?.trim();
  if (!override) return CHAT_REASONING_EFFORT[modelId] ?? null;
  if (override === MODEL_DEFAULT_EFFORT) return null;
  if (isReasoningEffort(override)) return override;
  throw new Error(`${CHAT_REASONING_EFFORT_ENV} must be ${MODEL_DEFAULT_EFFORT} or one of ${REASONING_EFFORTS.join(", ")}`);
}

function openRouterClient(apiKey: string) {
  return createOpenRouter({ apiKey, compatibility: "strict", appName: process.env.OPENROUTER_APP_TITLE ?? "Winyu", appUrl: OPENROUTER_APP_URL });
}

/** Cuts a call (its request and its stream) that runs past `ms`. */
function deadlineMiddleware(ms: number): LanguageModelMiddleware {
  return {
    specificationVersion: "v3",
    transformParams: async ({ params }) => {
      const deadline = AbortSignal.timeout(ms);
      return { ...params, abortSignal: params.abortSignal ? AbortSignal.any([params.abortSignal, deadline]) : deadline };
    },
  };
}

/** A model that opens its stream and never sends a chunk, without calling the provider: the stall of AI-341 on demand. */
const STALLED: LanguageModelMiddleware = {
  specificationVersion: "v3",
  wrapStream: async () => ({ stream: new ReadableStream() }),
};

/** Outside production WINYU_DEV_STALL_FLEX=1 makes the chat's first tier stall, so the chat's time budget and fallback can be watched live. */
function stalledFlex(): LanguageModelMiddleware[] {
  return process.env[STALL_FLEX_ENV] === "1" && process.env.NODE_ENV !== PRODUCTION ? [STALLED] : [];
}

function metered(modelId: string, model: Exclude<LanguageModel, string>, inner: LanguageModelMiddleware[] = []): MeteredModel {
  return wrapLanguageModel({ model: model as WrappableModel, middleware: [traceMiddleware(), meterMiddleware(modelId), ...inner] });
}

/** Metered for `owner` and kept out of the run trace: a title is named after the run's last step and is not one of its steps. */
function meteredFor(owner: CallOwner, modelId: string, model: Exclude<LanguageModel, string>, inner: LanguageModelMiddleware[]): MeteredModel {
  return wrapLanguageModel({ model: model as WrappableModel, middleware: [meterMiddleware(modelId, owner), ...inner] });
}

/** Usage in every reply, and where OpenRouter sends the call (null lets it choose); fallbacks stay allowed. */
function settingsFor(order: string[] | null) {
  return { usage: { include: true as const }, ...(order ? { provider: { order, allow_fallbacks: true } } : {}) };
}

/** The OpenRouter model (AGENT_MODEL, else Gemini 3.8 Flash), traced and metered; null when no OPENROUTER_API_KEY is set. */
export function agentModel(): AgentModel | null {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  const id = process.env.AGENT_MODEL || DEFAULT_OPENROUTER_MODEL;
  const client = openRouterClient(apiKey);
  const effort = chatReasoningEffortOf(id);
  const settings = settingsFor(providerOrderOf(id));
  const chatSettings = { ...settings, ...(effort ? { reasoning: { effort } } : {}) };
  const fallbackSettings = { ...settingsFor(FALLBACK_PROVIDER_ORDER[id] ?? null), ...(effort ? { reasoning: { effort } } : {}) };
  const titleSettings = { ...settings, reasoning: { effort: TITLE_REASONING_EFFORT } };
  return {
    id,
    name: MODEL_NAMES[id] ?? id,
    chat: () => metered(id, client(id, chatSettings), stalledFlex()),
    chatFallback: () => metered(id, client(id, fallbackSettings)),
    model: () => metered(id, client(id, settings), [deadlineMiddleware(BACKGROUND_CALL_MS)]),
    title: (owner) => meteredFor(owner, id, client(id, titleSettings), [deadlineMiddleware(TITLE_CALL_MS)]),
  };
}

/** The model background jobs (memory extraction and review, digest, titles) run on, or null when no real model is configured. */
export function utilityModel(): LanguageModel | null {
  return agentModel()?.model() ?? null;
}

/** An OpenRouter embedding model by id, or null when no OPENROUTER_API_KEY is set; the caller records its usage with `recordEmbedding`. */
export function embeddingModel(id: string) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  return apiKey ? openRouterClient(apiKey).textEmbeddingModel(id) : null;
}
