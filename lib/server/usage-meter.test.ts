import { describe, expect, test } from "bun:test";
import { generateText, streamText, wrapLanguageModel } from "ai";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { findUser } from "@/lib/data/entities/users";
import { liveAccessFor } from "@/lib/access/enforce";
import { modelCalls, modelSpend } from "./model-ledger";
import { runWithAccess, runWithTurn } from "./request-context";
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

  test("calls outside a scope are not counted in the next scope", async () => {
    await generateText({ model: model(BILLED), prompt: "hi" });
    const { usage } = await measure(async () => null);
    expect(usage.calls).toBe(0);
  });
});

describe("model ledger", () => {
  function newCalls(before: Set<string>) {
    const calls = modelCalls().all().filter((call) => !before.has(call.id));
    for (const call of calls) modelCalls().remove(call.id);
    return calls;
  }

  test("a chat call is kept with who asked, which turn, and what OpenRouter billed", async () => {
    const user = findUser("u_krit");
    if (!user) throw new Error("missing u_krit");
    const before = new Set(modelCalls().all().map((call) => call.id));
    const turn = { turnId: "turn-ledger", threadId: null, preloadPacketId: null, question: "hi", queries: [] };
    await runWithAccess(liveAccessFor(user), () =>
      runWithTurn(turn, async () => {
        const result = streamText({ model: model(BILLED), prompt: "hi" });
        await result.consumeStream();
      }),
    );
    const [call] = newCalls(before);
    expect([call.source, call.userId, call.turnId, call.billedUsd]).toEqual(["chat", "u_krit", "turn-ledger", 0.0123]);
  });

  test("background and eval calls are told apart, and spend adds billed and estimated", async () => {
    for (const call of modelCalls().all()) modelCalls().remove(call.id);
    const before = new Set<string>();
    const since = new Date(Date.now() - 1000).toISOString();
    await generateText({ model: model(BILLED), prompt: "hi" });
    await measure(() => generateText({ model: model(undefined), prompt: "hi" }));
    const spend = modelSpend(since);
    const calls = newCalls(before);
    expect(calls.map((call) => call.source).sort()).toEqual(["background", "eval"]);
    expect(spend.billedCalls).toBe(1);
    expect(spend.totalUsd).toBeCloseTo(0.0123 + 0.75 + 0.2 * 3.75);
  });
});
