import { randomUUID } from "node:crypto";
import { collection } from "@/lib/server/store/json-store";

export const MODEL_CALLS_COLLECTION = "model-calls";

export type ModelCallSource = "chat" | "eval" | "background";

/** One model call as the provider reported it: tokens, and the cost it billed when it says so. */
export type ModelCall = {
  id: string;
  at: string;
  modelId: string;
  source: ModelCallSource;
  userId: string | null;
  turnId: string | null;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  billedUsd: number | null;
  estimatedUsd: number;
};

export type ModelSpend = {
  calls: number;
  billedCalls: number;
  totalUsd: number;
  billedUsd: number;
  inputTokens: number;
  outputTokens: number;
  bySource: Record<ModelCallSource, number>;
};

export function modelCalls() {
  return collection<ModelCall>(MODEL_CALLS_COLLECTION);
}

export function recordModelCall(call: Omit<ModelCall, "id" | "at">): void {
  modelCalls().put({ id: randomUUID(), at: new Date().toISOString(), ...call });
}

/** What the models cost since a moment: billed where the provider said, estimated only for calls it did not. */
export function modelSpend(since: string | null): ModelSpend {
  const spend: ModelSpend = { calls: 0, billedCalls: 0, totalUsd: 0, billedUsd: 0, inputTokens: 0, outputTokens: 0, bySource: { chat: 0, eval: 0, background: 0 } };
  for (const call of modelCalls().all()) {
    if (since && call.at < since) continue;
    const usd = call.billedUsd ?? call.estimatedUsd;
    spend.calls += 1;
    spend.totalUsd += usd;
    spend.inputTokens += call.inputTokens;
    spend.outputTokens += call.outputTokens;
    spend.bySource[call.source] += usd;
    if (call.billedUsd === null) continue;
    spend.billedCalls += 1;
    spend.billedUsd += call.billedUsd;
  }
  return spend;
}

export type RunSpend = { calls: number; inputTokens: number; outputTokens: number; usd: number };

/** What the model calls of one harness run cost: the ledger keys each call by the run it served. */
export function runSpend(runId: string): RunSpend {
  const spend: RunSpend = { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 };
  for (const call of modelCalls().all()) {
    if (call.turnId !== runId) continue;
    spend.calls += 1;
    spend.inputTokens += call.inputTokens;
    spend.outputTokens += call.outputTokens;
    spend.usd += call.billedUsd ?? call.estimatedUsd;
  }
  return spend;
}
