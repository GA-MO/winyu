import { describe, expect, test } from "bun:test";
import { generateText, streamText, wrapLanguageModel } from "ai";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { measure, meterMiddleware } from "./usage-meter";

const MODEL_ID = "google/gemini-3.8-flash";
const USAGE = {
  inputTokens: { total: 1_000_000, noCache: 900_000, cacheRead: 100_000, cacheWrite: undefined },
  outputTokens: { total: 200_000, text: 150_000, reasoning: 50_000 },
};
const BILLED = { openrouter: { usage: { cost: 0.0123 } } };

function model(providerMetadata: typeof BILLED | undefined) {
  const mock = new MockLanguageModelV3({
    doGenerate: async () => ({ content: [{ type: "text", text: "ok" }], finishReason: { unified: "stop", raw: "stop" }, usage: USAGE, warnings: [], providerMetadata }),
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "t" },
          { type: "text-delta", id: "t", delta: "ok" },
          { type: "text-end", id: "t" },
          { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: USAGE, providerMetadata },
        ],
      }),
    }),
  });
  return wrapLanguageModel({ model: mock, middleware: meterMiddleware(MODEL_ID) });
}

describe("usage meter", () => {
  test("a streamed call is counted with the cost the provider billed", async () => {
    const { usage } = await measure(async () => {
      const result = streamText({ model: model(BILLED), prompt: "hi" });
      await result.consumeStream();
    });
    expect(usage.calls).toBe(1);
    expect(usage.inputTokens).toBe(1_000_000);
    expect(usage.cachedTokens).toBe(100_000);
    expect(usage.reasoningTokens).toBe(50_000);
    expect(usage.billedUsd).toBeCloseTo(0.0123);
    expect(usage.billedCalls).toBe(1);
  });

  test("without a billed cost the estimate uses the model's rate", async () => {
    const { usage } = await measure(() => generateText({ model: model(undefined), prompt: "hi" }));
    expect(usage.billedCalls).toBe(0);
    expect(usage.estimatedUsd).toBeCloseTo(0.75 + 0.2 * 3.75);
  });

  test("calls outside a scope are not counted anywhere", async () => {
    await generateText({ model: model(BILLED), prompt: "hi" });
    const { usage } = await measure(async () => null);
    expect(usage.calls).toBe(0);
  });
});
