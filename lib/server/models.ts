import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { wrapLanguageModel, type LanguageModel } from "ai";
import { createScriptedModel, MOCK_MODEL_ID } from "vexa/mock";
import type { ModelRegistry } from "vexa/server";
import { COP_MOCK_SCRIPT } from "./mock-script";
import { meterMiddleware } from "./usage-meter";

const SONNET_ID = "claude-sonnet-5";
const HAIKU_ID = "claude-haiku-4-5-20251001";
const ANTHROPIC_CONTEXT_TOKENS = 200_000;
const OPENROUTER_APP_URL = "http://localhost:3100";
const DEFAULT_OPENROUTER_MODEL = "google/gemini-3.8-flash";
const OPENROUTER_CONTEXT_TOKENS = 1_000_000;
const MODEL_NAMES: Record<string, string> = { "google/gemini-3.8-flash": "Gemini 3.8 Flash" };
const PROVIDER_ORDER: Record<string, string[]> = { "google/gemini-3.8-flash": ["google-ai-studio/flex", "google-ai-studio"] };

/** Where OpenRouter sends a model first: one provider keeps the prompt cache shared across users, the flex tier halves the price, fallbacks stay allowed; OPENROUTER_PROVIDER_ORDER (comma list, e.g. "google-ai-studio") overrides it. */
function providerOrderOf(modelId: string): string[] | null {
  const override = (process.env.OPENROUTER_PROVIDER_ORDER ?? "").split(",").map((slug) => slug.trim()).filter(Boolean);
  if (override.length > 0) return override;
  return PROVIDER_ORDER[modelId] ?? null;
}

const MOCK: ModelRegistry = {
  [MOCK_MODEL_ID]: { model: () => createScriptedModel(COP_MOCK_SCRIPT), name: "Mock (scripted, ฟรี)", provider: "vexa-mock", maxTokens: 8_000 },
};

function metered(modelId: string, model: Exclude<LanguageModel, string>) {
  return wrapLanguageModel({ model: model as Parameters<typeof wrapLanguageModel>[0]["model"], middleware: meterMiddleware(modelId) });
}

function anthropicModels(apiKey: string): ModelRegistry {
  const anthropic = createAnthropic({ apiKey });
  return {
    [SONNET_ID]: { model: () => metered(SONNET_ID, anthropic(SONNET_ID)), name: "Claude Sonnet 5", maxTokens: ANTHROPIC_CONTEXT_TOKENS },
    [HAIKU_ID]: { model: () => metered(HAIKU_ID, anthropic(HAIKU_ID)), name: "Claude Haiku 4.5", maxTokens: ANTHROPIC_CONTEXT_TOKENS },
  };
}

function openRouterModels(apiKey: string, modelId: string): ModelRegistry {
  const client = createOpenRouter({ apiKey, compatibility: "strict", appName: process.env.OPENROUTER_APP_TITLE ?? "Cop", appUrl: OPENROUTER_APP_URL });
  const order = providerOrderOf(modelId);
  const settings = { usage: { include: true }, ...(order ? { provider: { order, allow_fallbacks: true } } : {}) };
  return { [modelId]: { model: () => metered(modelId, client(modelId, settings)), name: MODEL_NAMES[modelId] ?? modelId, provider: "openrouter", maxTokens: OPENROUTER_CONTEXT_TOKENS } };
}

/** The registry GET /api/chat publishes; the first entry is the default: one OpenRouter model (AGENT_MODEL, else Gemini 3.8 Flash) when its key is set, then the scripted mock. */
export function models(): ModelRegistry {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const modelId = process.env.AGENT_MODEL || DEFAULT_OPENROUTER_MODEL;
  return {
    ...(openRouterKey ? openRouterModels(openRouterKey, modelId) : {}),
    ...(anthropicKey ? anthropicModels(anthropicKey) : {}),
    ...MOCK,
  };
}

/** The model background jobs (memory extraction and review) run on: the default real model, or null when only the scripted mock is configured. */
export function utilityModel(): LanguageModel | null {
  const [id, entry] = Object.entries(models())[0] ?? [];
  if (!id || id === MOCK_MODEL_ID || !entry || typeof entry !== "object" || !("model" in entry)) return null;
  return typeof entry.model === "function" ? entry.model() : entry.model;
}
