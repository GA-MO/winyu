import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";

type StreamResult = Awaited<ReturnType<MockLanguageModelV3["doStream"]>>;
type StreamPart = StreamResult["stream"] extends ReadableStream<infer Part> ? Part : never;

/** One model reply in a script: a call to one tool with its arguments, or the closing words. */
export type ScriptedStep = { call: string; args: Record<string, unknown> } | { text: string };

const USAGE = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
const FALLBACK_TEXT = "ไม่มีขั้นต่อไปในสคริปต์";

function partsOf(step: ScriptedStep, index: number): StreamPart[] {
  if ("call" in step) {
    return [
      { type: "stream-start", warnings: [] },
      { type: "tool-call", toolCallId: `scripted-${index}`, toolName: step.call, input: JSON.stringify(step.args) },
      { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage: USAGE },
    ];
  }
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

  /** Replaces what the model says next. */
  script(steps: readonly ScriptedStep[]): void {
    this.steps = [...steps];
  }

  /** The `@/lib/server/models` module with this model as the agent's model and no utility model, for `mock.module`. */
  modelsModule() {
    return { agentModel: () => ({ id: "scripted", name: "scripted", model: () => this.model }), utilityModel: () => null };
  }

  private next(): StreamResult {
    this.served += 1;
    const step = this.steps.shift() ?? { text: FALLBACK_TEXT };
    return { stream: simulateReadableStream({ chunks: partsOf(step, this.served) }) };
  }
}
