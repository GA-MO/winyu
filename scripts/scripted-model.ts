import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import * as models from "@/lib/server/models";
import type { CallOwner } from "@/lib/server/usage-meter";

type StreamResult = Awaited<ReturnType<MockLanguageModelV3["doStream"]>>;
type GenerateResult = Awaited<ReturnType<MockLanguageModelV3["doGenerate"]>>;
type StreamPart = StreamResult["stream"] extends ReadableStream<infer Part> ? Part : never;

type ScriptedCall = { call: string; args: Record<string, unknown> };

/** One model reply in a script: a call to one tool with its arguments, several calls in one step, the closing words (streamed a character at a time `delayMs` apart when given), a model that never answers (a process killed mid-call, a stalled provider), or one that asks for a tool and then goes silent before it finishes the step. */
export type ScriptedStep = ScriptedCall | { calls: ScriptedCall[] } | { text: string; delayMs?: number } | { hang: true } | { silentAfter: ScriptedCall };

type SpokenStep = Exclude<ScriptedStep, { hang: true } | { silentAfter: ScriptedCall }>;

const USAGE = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
const FALLBACK_TEXT = "ไม่มีขั้นต่อไปในสคริปต์";
const SCRIPTED_TITLE = "ชื่อบทสนทนาจากสคริปต์";

function toolCallsOf(calls: readonly ScriptedCall[], index: number): StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    ...calls.map((step, position): StreamPart => ({ type: "tool-call", toolCallId: position === 0 ? `scripted-${index}` : `scripted-${index}-${position}`, toolName: step.call, input: JSON.stringify(step.args) })),
    { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage: USAGE },
  ];
}

function generatedOf(step: SpokenStep, index: number): GenerateResult {
  if ("text" in step) return { content: [{ type: "text", text: step.text }], finishReason: { unified: "stop", raw: "stop" }, usage: USAGE, warnings: [] };
  const calls = "call" in step ? [step] : step.calls;
  const content = calls.map((call, position) => ({ type: "tool-call" as const, toolCallId: position === 0 ? `scripted-${index}` : `scripted-${index}-${position}`, toolName: call.call, input: JSON.stringify(call.args) }));
  return { content, finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage: USAGE, warnings: [] };
}

function partsOf(step: SpokenStep, index: number): StreamPart[] {
  if ("call" in step) return toolCallsOf([step], index);
  if ("calls" in step) return toolCallsOf(step.calls, index);
  const deltas = step.delayMs ? Array.from(step.text) : [step.text];
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: `text-${index}` },
    ...deltas.map((delta): StreamPart => ({ type: "text-delta", id: `text-${index}`, delta })),
    { type: "text-end", id: `text-${index}` },
    { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: USAGE },
  ];
}

function silentAfter(parts: StreamPart[]): ReadableStream<StreamPart> {
  return new ReadableStream<StreamPart>({ start: (controller) => parts.forEach((part) => controller.enqueue(part)) });
}

/** A stand-in for the chat model in tests: each model call, streamed or generated, takes the next step of the current script, so a whole turn runs through the real agent, gateway and harness without a paid call. */
export class ScriptedModel {
  private steps: ScriptedStep[] = [];
  private served = 0;
  private titleText: string | null = SCRIPTED_TITLE;
  readonly model = new MockLanguageModelV3({ provider: "scripted", modelId: "scripted", doStream: async () => this.next(), doGenerate: () => this.generated() });
  /** Whom each thread title was billed to, in the order they were asked. */
  readonly titleOwners: CallOwner[] = [];
  /** The title model: apart from the script, so naming a thread never takes a step meant for a chat turn; it answers `titleText`, or never when that is null. */
  readonly titleModel = new MockLanguageModelV3({
    provider: "scripted",
    modelId: "scripted-title",
    doGenerate: () => (this.titleText === null ? new Promise(() => {}) : Promise.resolve(generatedOf({ text: this.titleText }, 0))),
  });

  /** How many model calls this stand-in has served. */
  get calls(): number {
    return this.served;
  }

  /** What the title model answers from now on; null makes it never answer. */
  titles(text: string | null): void {
    this.titleText = text;
  }

  /** Replaces what the model says next. */
  script(steps: readonly ScriptedStep[]): void {
    this.steps = [...steps];
  }

  /** The `@/lib/server/models` module with this model as the agent's model and no utility model (the rest as it is), for `mock.module`. */
  modelsModule() {
    const agentModel = (): models.AgentModel => ({ id: "scripted", name: "scripted", chat: () => this.model, chatFallback: () => this.model, model: () => this.model, title: (owner) => this.titleFor(owner) });
    return { ...models, agentModel, utilityModel: () => null };
  }

  private titleFor(owner: CallOwner): MockLanguageModelV3 {
    this.titleOwners.push(owner);
    return this.titleModel;
  }

  private generated(): Promise<GenerateResult> {
    this.served += 1;
    const step = this.steps.shift() ?? { text: FALLBACK_TEXT };
    if ("hang" in step || "silentAfter" in step) return new Promise(() => {});
    return Promise.resolve(generatedOf(step, this.served));
  }

  private next(): StreamResult {
    this.served += 1;
    const step = this.steps.shift() ?? { text: FALLBACK_TEXT };
    if ("hang" in step) return { stream: new ReadableStream<StreamPart>() };
    if ("silentAfter" in step) return { stream: silentAfter(toolCallsOf([step.silentAfter], this.served).slice(0, -1)) };
    const chunkDelayInMs = "delayMs" in step ? step.delayMs : undefined;
    return { stream: simulateReadableStream({ chunks: partsOf(step, this.served), chunkDelayInMs }) };
  }
}
