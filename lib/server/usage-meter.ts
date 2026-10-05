import { AsyncLocalStorage } from "node:async_hooks";
import type { LanguageModelMiddleware } from "ai";
import { recordModelCall, type ModelCallSource } from "./model-ledger";
import { accessOrNull, currentTurn } from "./request-context";

const PER_MILLION = 1_000_000;

export type Rate = { input: number; output: number };

/** USD per million tokens, used only when the provider does not report what the call cost. */
export const RATES: Record<string, Rate> = {
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  "google/gemini-3.8-flash": { input: 0.75, output: 3.75 },
};

const FREE: Rate = { input: 0, output: 0 };

export function rateOf(modelId: string): Rate {
  return RATES[modelId] ?? FREE;
}

/** What the model calls inside one scope used: tokens as the provider counted them, and cost as billed when the provider says so. */
export type Metered = {
  calls: number;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  billedUsd: number;
  billedCalls: number;
  estimatedUsd: number;
};

type CallUsage = {
  inputTokens: { total: number | undefined; cacheRead: number | undefined };
  outputTokens: { total: number | undefined; reasoning: number | undefined };
};

type ProviderMetadata = Record<string, Record<string, unknown> | undefined> | undefined;

const scope = new AsyncLocalStorage<Metered>();

export function emptyMeter(): Metered {
  return { calls: 0, inputTokens: 0, cachedTokens: 0, outputTokens: 0, reasoningTokens: 0, billedUsd: 0, billedCalls: 0, estimatedUsd: 0 };
}

function billedCostOf(metadata: ProviderMetadata): number | null {
  const usage = metadata?.openrouter?.usage as { cost?: unknown } | undefined;
  return typeof usage?.cost === "number" ? usage.cost : null;
}

type CallContext = { meter: Metered | undefined; userId: string | null; turnId: string | null };

function contextNow(): CallContext {
  return { meter: scope.getStore(), userId: accessOrNull()?.userId ?? null, turnId: currentTurn().turnId };
}

function sourceOf(context: CallContext): ModelCallSource {
  if (context.meter) return "eval";
  return context.userId ? "chat" : "background";
}

function record(modelId: string, usage: CallUsage, metadata: ProviderMetadata, context: CallContext): void {
  const { meter } = context;
  const input = usage.inputTokens.total ?? 0;
  const output = usage.outputTokens.total ?? 0;
  const rate = rateOf(modelId);
  const billed = billedCostOf(metadata);
  const estimated = (input * rate.input + output * rate.output) / PER_MILLION;
  recordModelCall({
    modelId,
    source: sourceOf(context),
    userId: context.userId,
    turnId: context.turnId,
    inputTokens: input,
    cachedTokens: usage.inputTokens.cacheRead ?? 0,
    outputTokens: output,
    reasoningTokens: usage.outputTokens.reasoning ?? 0,
    billedUsd: billed,
    estimatedUsd: estimated,
  });
  if (!meter) return;
  meter.calls += 1;
  meter.inputTokens += input;
  meter.cachedTokens += usage.inputTokens.cacheRead ?? 0;
  meter.outputTokens += output;
  meter.reasoningTokens += usage.outputTokens.reasoning ?? 0;
  meter.estimatedUsd += estimated;
  if (billed === null) return;
  meter.billedUsd += billed;
  meter.billedCalls += 1;
}

/** Runs `work` and returns what every model call inside it used; every call also lands in the model ledger, scope or not. */
export async function measure<T>(work: () => Promise<T>): Promise<{ result: T; usage: Metered }> {
  const meter = emptyMeter();
  const result = await scope.run(meter, work);
  return { result, usage: meter };
}

/** Records each generate and stream call of one model in the ledger (who, which turn, tokens, billed cost) and counts it into the current `measure` scope. */
export function meterMiddleware(modelId: string): LanguageModelMiddleware {
  return {
    specificationVersion: "v3",
    wrapGenerate: async ({ doGenerate }) => {
      const context = contextNow();
      const result = await doGenerate();
      record(modelId, result.usage, result.providerMetadata as ProviderMetadata, context);
      return result;
    },
    wrapStream: async ({ doStream }) => {
      const context = contextNow();
      const { stream, ...rest } = await doStream();
      const counted = stream.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            if (chunk.type === "finish") record(modelId, chunk.usage, chunk.providerMetadata as ProviderMetadata, context);
            controller.enqueue(chunk);
          },
        }),
      );
      return { stream: counted, ...rest };
    },
  };
}
