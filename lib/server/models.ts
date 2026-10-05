import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { wrapLanguageModel, type LanguageModel } from "ai";
import { traceMiddleware } from "@/lib/harness/trace";
import { meterMiddleware } from "./usage-meter";

const OPENROUTER_APP_URL = "http://localhost:3100";
const DEFAULT_OPENROUTER_MODEL = "google/gemini-3.8-flash";
const MODEL_NAMES: Record<string, string> = { "google/gemini-3.8-flash": "Gemini 3.8 Flash" };
const PROVIDER_ORDER: Record<string, string[]> = { "google/gemini-3.8-flash": ["google-ai-studio/flex", "google-ai-studio"] };

/** Provider options that mark a system message for OpenRouter's explicit prompt cache: Gemini's implicit cache missed byte-identical repeats, the marked prompt is read back at a quarter of the input price; the cache holds the tool definitions and the whole system prompt. */
export const CACHED_SYSTEM_PROMPT = { openrouter: { cacheControl: { type: "ephemeral" } } };

/** The one real model the agent runs on, with the id it is billed and traced under. */
export type AgentModel = { id: string; name: string; model: () => MeteredModel };

type MeteredModel = ReturnType<typeof wrapLanguageModel>;

type WrappableModel = Parameters<typeof wrapLanguageModel>[0]["model"];

/** Where OpenRouter sends a model first: one provider keeps the prompt cache shared across users, the flex tier halves the price, fallbacks stay allowed; OPENROUTER_PROVIDER_ORDER (comma list, e.g. "google-ai-studio") overrides it. */
function providerOrderOf(modelId: string): string[] | null {
  const override = (process.env.OPENROUTER_PROVIDER_ORDER ?? "").split(",").map((slug) => slug.trim()).filter(Boolean);
  if (override.length > 0) return override;
  return PROVIDER_ORDER[modelId] ?? null;
}

function metered(modelId: string, model: Exclude<LanguageModel, string>): MeteredModel {
  return wrapLanguageModel({ model: model as WrappableModel, middleware: [traceMiddleware(), meterMiddleware(modelId)] });
}

/** The OpenRouter model (AGENT_MODEL, else Gemini 3.8 Flash), traced and metered; null when no OPENROUTER_API_KEY is set. */
export function agentModel(): AgentModel | null {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  const id = process.env.AGENT_MODEL || DEFAULT_OPENROUTER_MODEL;
  const client = createOpenRouter({ apiKey, compatibility: "strict", appName: process.env.OPENROUTER_APP_TITLE ?? "Winyu", appUrl: OPENROUTER_APP_URL });
  const order = providerOrderOf(id);
  const settings = { usage: { include: true }, ...(order ? { provider: { order, allow_fallbacks: true } } : {}) };
  return { id, name: MODEL_NAMES[id] ?? id, model: () => metered(id, client(id, settings)) };
}

/** The model background jobs (memory extraction and review, digest, titles) run on, or null when no real model is configured. */
export function utilityModel(): LanguageModel | null {
  return agentModel()?.model() ?? null;
}
