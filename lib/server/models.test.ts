import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { generateText } from "ai";
import { agentModel } from "./models";

const OPENROUTER_KEYS = ["OPENROUTER_API_KEY", "AGENT_MODEL", "OPENROUTER_PROVIDER_ORDER", "OPENROUTER_CHAT_REASONING_EFFORT"] as const;
const COMPLETION = {
  id: "gen-test",
  object: "chat.completion",
  created: 0,
  model: "google/gemini-3.8-flash",
  choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
};

type SentBody = { model: string; reasoning?: unknown; provider?: unknown };

const realFetch = globalThis.fetch;
const savedEnv = new Map<string, string | undefined>();
let sent: SentBody[] = [];

async function bodySentToOpenRouter(use: "chat" | "model" = "chat"): Promise<SentBody> {
  const model = agentModel();
  if (!model) throw new Error("no model configured");
  await generateText({ model: model[use](), prompt: "hi" });
  const body = sent.at(-1);
  if (!body) throw new Error("nothing was sent");
  return body;
}

beforeEach(() => {
  for (const key of OPENROUTER_KEYS) savedEnv.set(key, process.env[key]);
  for (const key of OPENROUTER_KEYS) delete process.env[key];
  process.env.OPENROUTER_API_KEY = "test-key";
  sent = [];
  globalThis.fetch = Object.assign(
    async (_url: unknown, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)) as SentBody);
      return new Response(JSON.stringify(COMPLETION), { status: 200, headers: { "content-type": "application/json" } });
    },
    { preconnect: realFetch.preconnect },
  );
});

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("the settings sent to OpenRouter", () => {
  test("the chat runs Gemini 3.8 Flash on the flex tier first with medium reasoning effort", async () => {
    const body = await bodySentToOpenRouter("chat");
    expect(body.model).toBe("google/gemini-3.8-flash");
    expect(body.provider).toEqual({ order: ["google-ai-studio/flex", "google-ai-studio"], allow_fallbacks: true });
    expect(body.reasoning).toEqual({ effort: "medium" });
  });

  test("background work runs on the same tier with the model's own reasoning", async () => {
    const body = await bodySentToOpenRouter("model");
    expect(body.provider).toEqual({ order: ["google-ai-studio/flex", "google-ai-studio"], allow_fallbacks: true });
    expect("reasoning" in body).toBe(false);
  });

  test("OPENROUTER_CHAT_REASONING_EFFORT sets another effort for the chat only", async () => {
    process.env.OPENROUTER_CHAT_REASONING_EFFORT = "low";
    expect((await bodySentToOpenRouter("chat")).reasoning).toEqual({ effort: "low" });
    expect("reasoning" in (await bodySentToOpenRouter("model"))).toBe(false);
  });

  test("OPENROUTER_CHAT_REASONING_EFFORT=default lets the chat think as long as the model likes", async () => {
    process.env.OPENROUTER_CHAT_REASONING_EFFORT = "default";
    expect("reasoning" in (await bodySentToOpenRouter("chat"))).toBe(false);
  });

  test("an unknown effort is refused instead of silently sent", () => {
    process.env.OPENROUTER_CHAT_REASONING_EFFORT = "fast";
    expect(() => agentModel()).toThrow("OPENROUTER_CHAT_REASONING_EFFORT");
  });

  test("OPENROUTER_PROVIDER_ORDER sends the standard tier without changing the effort", async () => {
    process.env.OPENROUTER_PROVIDER_ORDER = "google-ai-studio";
    const body = await bodySentToOpenRouter("chat");
    expect(body.provider).toEqual({ order: ["google-ai-studio"], allow_fallbacks: true });
    expect(body.reasoning).toEqual({ effort: "medium" });
  });

  test("a model with no default of its own gets no reasoning setting", async () => {
    process.env.AGENT_MODEL = "openai/gpt-test";
    const body = await bodySentToOpenRouter("chat");
    expect(body.model).toBe("openai/gpt-test");
    expect("reasoning" in body).toBe(false);
    expect("provider" in body).toBe(false);
  });
});
