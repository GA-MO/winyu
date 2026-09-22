import { createAnthropic } from "@ai-sdk/anthropic";
import { createScriptedModel, MOCK_MODEL_ID } from "vexa/mock";
import type { ModelRegistry } from "vexa/server";
import { COP_MOCK_SCRIPT } from "./mock-script";

const SONNET_ID = "claude-sonnet-5";
const HAIKU_ID = "claude-haiku-4-5-20251001";
const ANTHROPIC_CONTEXT_TOKENS = 200_000;

const MOCK: ModelRegistry = {
  [MOCK_MODEL_ID]: { model: () => createScriptedModel(COP_MOCK_SCRIPT), name: "Mock (scripted, ฟรี)", provider: "vexa-mock", maxTokens: 8_000 },
};

/** The registry GET /api/chat publishes; the first entry is the default. Anthropic models appear only when the key is set. */
export function models(): ModelRegistry {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return MOCK;
  const anthropic = createAnthropic({ apiKey });
  return {
    [SONNET_ID]: { model: () => anthropic(SONNET_ID), name: "Claude Sonnet 5", maxTokens: ANTHROPIC_CONTEXT_TOKENS },
    [HAIKU_ID]: { model: () => anthropic(HAIKU_ID), name: "Claude Haiku 4.5", maxTokens: ANTHROPIC_CONTEXT_TOKENS },
    ...MOCK,
  };
}
