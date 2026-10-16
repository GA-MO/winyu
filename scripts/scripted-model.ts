import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import * as models from "@/lib/server/models";

type StreamResult = Awaited<ReturnType<MockLanguageModelV3["doStream"]>>;
type StreamPart = StreamResult["stream"] extends ReadableStream<infer Part> ? Part : never;

type ScriptedCall = { call: string; args: Record<string, unknown> };

/** One model reply in a script: a call to one tool with its arguments, several calls in one step, the closing words, or a model that never answers (a process killed mid-call). */
export type ScriptedStep = ScriptedCall | { calls: ScriptedCall[] } | { text: string } | { hang: true };

type SpokenStep = Exclude<ScriptedStep, { hang: true }>;

const USAGE = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
const FALLBACK_TEXT = "ไม่มีขั้นต่อไปในสคริปต์";

function toolCallsOf(calls: readonly ScriptedCall[], index: number): StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    ...calls.map((step, position): StreamPart => ({ type: "tool-call", toolCallId: position === 0 ? `scripted-${index}` : `scripted-${index}-${position}`, toolName: step.call, input: JSON.stringify(step.args) })),
    { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage: USAGE },
  ];
}

function partsOf(step: SpokenStep, index: number): StreamPart[] {
  if ("call" in step) return toolCallsOf([step], index);
  if ("calls" in step) return toolCallsOf(step.calls, index);
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: `text-${index}` },
    { type: "text-delta", id: `text-${index}`, delta: step.text },
    { type: "text-end", id: `text-${index}` },
    { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: USAGE },
  ];
}

/** A stand-in for the chat model in tests: each model call takes the next step of the current script, so a whole turn runs through the real agent, gateway and harness without a paid call. */
export class ScriptedModel {
  private steps: ScriptedStep[] = [];
  private served = 0;
  readonly model = new MockLanguageModelV3({ provider: "scripted", modelId: "scripted", doStream: async () => this.next() });

  /** How many model calls this stand-in has served. */
  get calls(): number {
    return this.served;
  }

  /** Replaces what the model says next. */
  script(steps: readonly ScriptedStep[]): void {
    this.steps = [...steps];
  }

  /** The `@/lib/server/models` module with this model as the agent's model and no utility model (the rest as it is), for `mock.module`. */
  modelsModule() {
    return { ...models, agentModel: () => ({ id: "scripted", name: "scripted", model: () => this.model }), utilityModel: () => null };
  }

  private next(): StreamResult {
    this.served += 1;
    const step = this.steps.shift() ?? { text: FALLBACK_TEXT };
    if ("hang" in step) return { stream: new ReadableStream<StreamPart>() };
    return { stream: simulateReadableStream({ chunks: partsOf(step, this.served) }) };
  }
}
