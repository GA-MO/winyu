import { AsyncLocalStorage } from "node:async_hooks";
import type { LanguageModelMiddleware } from "ai";
import { recordModelCall, type ModelCallSource } from "./model-ledger";
import { currentInitiator, currentRun } from "@/lib/harness/runtime";
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

/** Who a call is for when the call itself knows better than the request around it: a thread title is utility work done for one person after their turn. */
export type CallOwner = { source: ModelCallSource; userId: string | null; turnId: string | null };

type CallContext = { meter: Metered | undefined; owner: CallOwner };

function ownerNow(): CallOwner {
  const initiator = currentInitiator();
  const meter = scope.getStore();
  const userId = accessOrNull()?.userId ?? null;
  const source: ModelCallSource = initiator === "job" ? "background" : initiator === "studio" ? "studio" : meter ? "eval" : userId ? "chat" : "background";
  return { source, userId, turnId: currentTurn().turnId ?? currentRun()?.id ?? null };
}

function contextNow(owner?: CallOwner): CallContext {
  return { meter: scope.getStore(), owner: owner ?? ownerNow() };
}

function recordAborted(modelId: string, context: CallContext): void {
  recordModelCall({ modelId, ...context.owner, inputTokens: 0, cachedTokens: 0, outputTokens: 0, reasoningTokens: 0, billedUsd: null, estimatedUsd: 0, aborted: true });
  if (context.meter) context.meter.calls += 1;
}

function record(modelId: string, usage: CallUsage, metadata: ProviderMetadata, context: CallContext, latencyMs?: number): void {
  const { meter } = context;
  const input = usage.inputTokens.total ?? 0;
  const output = usage.outputTokens.total ?? 0;
  const rate = rateOf(modelId);
  const billed = billedCostOf(metadata);
  const estimated = (input * rate.input + output * rate.output) / PER_MILLION;
  recordModelCall({
    modelId,
    ...context.owner,
    inputTokens: input,
    cachedTokens: usage.inputTokens.cacheRead ?? 0,
    outputTokens: output,
    reasoningTokens: usage.outputTokens.reasoning ?? 0,
    billedUsd: billed,
    estimatedUsd: estimated,
    ...(latencyMs === undefined ? {} : { latencyMs }),
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

type StreamPart = { type: string };

/** The stream as read, recording the call once: with the usage of its finish chunk, or as aborted when it is cancelled, fails or ends without one. */
function countedStream<Part extends StreamPart>(stream: ReadableStream<Part>, onFinish: (chunk: Part) => void, onAborted: () => void): ReadableStream<Part> {
  const reader = stream.getReader();
  let recorded = false;
  const once = (write: () => void) => {
    if (recorded) return;
    recorded = true;
    write();
  };
  return new ReadableStream<Part>({
    async pull(controller) {
      const next = await reader.read().catch((error: unknown) => {
        once(onAborted);
        throw error;
      });
      if (next.done) {
        once(onAborted);
        controller.close();
        return;
      }
      if (next.value.type === "finish") once(() => onFinish(next.value));
      controller.enqueue(next.value);
    },
    cancel(reason) {
      once(onAborted);
      return reader.cancel(reason);
    },
  });
}

/** Records each generate and stream call of one model in the ledger (who, which turn, tokens, billed cost) and counts it into the current `measure` scope; a call cut off before it reported its usage (a time budget, a stop) is still recorded, as aborted. `owner` names who the call is for when the request around it does not. */
export function meterMiddleware(modelId: string, owner?: CallOwner): LanguageModelMiddleware {
  return {
    specificationVersion: "v3",
    wrapGenerate: async ({ doGenerate }) => {
      const context = contextNow(owner);
      const result = await Promise.resolve(doGenerate()).catch((error: unknown) => {
        recordAborted(modelId, context);
        throw error;
      });
      record(modelId, result.usage, result.providerMetadata as ProviderMetadata, context);
      return result;
    },
    wrapStream: async ({ doStream }) => {
      const context = contextNow(owner);
      const { stream, ...rest } = await Promise.resolve(doStream()).catch((error: unknown) => {
        recordAborted(modelId, context);
        throw error;
      });
      const counted = countedStream(
        stream,
        (chunk) => {
          if (chunk.type === "finish") record(modelId, chunk.usage, chunk.providerMetadata as ProviderMetadata, context);
        },
        () => recordAborted(modelId, context),
      );
      return { stream: counted, ...rest };
    },
  };
}

/** Records one embedding call in the ledger and the current `measure` scope: its input tokens, the cost OpenRouter billed, and how long it took. */
export function recordEmbedding(modelId: string, tokens: number, metadata: ProviderMetadata, latencyMs: number): void {
  record(modelId, { inputTokens: { total: tokens, cacheRead: 0 }, outputTokens: { total: 0, reasoning: 0 } }, metadata, contextNow(), latencyMs);
}
