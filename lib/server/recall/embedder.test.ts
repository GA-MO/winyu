import { afterEach, describe, expect, test } from "bun:test";
import { modelCalls } from "@/lib/server/model-ledger";
import { openRouterEmbedder } from "./embedder";

const SPEC = { modelId: "test/slow-embedder", dimension: 3, queryPrefix: "query: ", passagePrefix: "passage: " };
const DELAY_MS = 120;
const realFetch = globalThis.fetch;
const realKey = process.env.OPENROUTER_API_KEY;

function slowEmbeddings(): typeof fetch {
  return (async () => {
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    const body = { object: "list", model: SPEC.modelId, data: [{ object: "embedding", index: 0, embedding: [1, 0, 0] }], usage: { prompt_tokens: 4, total_tokens: 4, cost: 0.00000004 } };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = realKey;
  for (const call of modelCalls().where((row) => row.modelId === SPEC.modelId)) modelCalls().remove(call.id);
});

describe("recall embedding calls", () => {
  test("each call lands in the model ledger with how long it took, so a slow recall can be told apart from a slow search (AI-347)", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    globalThis.fetch = slowEmbeddings();
    expect(await openRouterEmbedder(SPEC).query("หนี้ค้าง")).toEqual([1, 0, 0]);
    const [call] = modelCalls().where((row) => row.modelId === SPEC.modelId);
    expect(call?.inputTokens).toBe(4);
    expect(call?.latencyMs).toBeGreaterThanOrEqual(DELAY_MS - 5);
  });
});
